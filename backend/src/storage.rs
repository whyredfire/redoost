use std::collections::BTreeMap;
use std::future::Future;
use std::time::Duration;

use anyhow::{Result, bail};
use aws_sdk_s3::Client;
use aws_sdk_s3::config::retry::RetryConfig;
use aws_sdk_s3::config::timeout::TimeoutConfig;
use aws_sdk_s3::config::{
    BehaviorVersion, Credentials, Region, RequestChecksumCalculation, ResponseChecksumValidation,
};
use aws_sdk_s3::error::ProvideErrorMetadata;
use aws_sdk_s3::types::{ChecksumMode, Delete, ObjectIdentifier};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use chrono::{DateTime, TimeDelta, Utc};
use futures::{StreamExt, TryStreamExt, stream};
use hmac::{Hmac, KeyInit, Mac};
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, utf8_percent_encode};
use serde::Serialize;
use serde_json::{Map, Value, json};
use sha2::Sha256;

use crate::config::Settings;
use crate::models::{ManifestFile, StoredObject, random_hex, starts_with_version_folder};

// Requests a client sends at once; the rest wait their turn rather than for a
// connection, which would count against the timeouts
pub const CONCURRENCY: usize = 32;

/// Like join_all, with at most `limit` running at once, failing on the first error.
pub fn limited<T, F: Future<Output = Result<T>>>(
    calls: impl IntoIterator<Item = F>,
    limit: usize,
) -> impl Future<Output = Result<Vec<T>>> {
    // Collected first, as a lazy iterator held across awaits trips up Send inference
    let calls: Vec<F> = calls.into_iter().collect();
    stream::iter(calls).buffered(limit).try_collect()
}

pub fn content_type(path: &str) -> String {
    let lower = path.to_lowercase();
    // Compressed files would otherwise get the MIME type of their contents. Like
    // Python's mimetypes, encodings match case and compressed archives don't.
    let encodings = [".gz", ".Z", ".bz2", ".xz", ".br"];
    let archives = [".tgz", ".taz", ".tz", ".tbz2", ".txz", ".svgz"];
    if encodings.iter().any(|suffix| path.ends_with(suffix))
        || archives.iter().any(|suffix| lower.ends_with(suffix))
    {
        return "application/octet-stream".into();
    }
    // Browsers and Python name JavaScript text/javascript, unlike mime_guess
    if lower.ends_with(".js") || lower.ends_with(".mjs") {
        return "text/javascript".into();
    }
    mime_guess::from_path(path)
        .first_raw()
        .unwrap_or("application/octet-stream")
        .into()
}

pub fn new_folder(slug: &str) -> String {
    format!("{slug}/v-{}/", random_hex(6))
}

/// The bucket that holds every site's files, under folders named after their slugs.
#[derive(Clone)]
pub struct Storage {
    pub client: Client,
    pub bucket: String,
}

impl Storage {
    pub fn new(settings: &Settings) -> Storage {
        let config = aws_sdk_s3::Config::builder()
            .behavior_version(BehaviorVersion::latest())
            .endpoint_url(settings.s3_endpoint.as_str())
            .region(Region::new(settings.s3_region.clone()))
            .credentials_provider(Credentials::new(
                &settings.s3_access_key_id,
                &settings.s3_secret_access_key,
                None,
                None,
                "redoost",
            ))
            .force_path_style(true)
            // Fails within the gateway's 60 seconds rather than hanging on S3:
            // three tries at 15 seconds stay under it
            .timeout_config(
                TimeoutConfig::builder()
                    .connect_timeout(Duration::from_secs(5))
                    .read_timeout(Duration::from_secs(15))
                    .build(),
            )
            .retry_config(RetryConfig::standard().with_max_attempts(3))
            // Garage checks the checksums uploads were signed with, and nothing else needs one
            .request_checksum_calculation(RequestChecksumCalculation::WhenRequired)
            .response_checksum_validation(ResponseChecksumValidation::WhenRequired)
            .build();
        Storage {
            client: Client::from_conf(config),
            bucket: settings.s3_bucket.clone(),
        }
    }

    pub async fn check(&self) -> Result<()> {
        self.client
            .head_bucket()
            .bucket(&self.bucket)
            .send()
            .await?;
        Ok(())
    }

    async fn list_keys(&self, prefix: &str) -> Result<Vec<String>> {
        let mut keys = Vec::new();
        let mut pages = self
            .client
            .list_objects_v2()
            .bucket(&self.bucket)
            .prefix(prefix)
            .into_paginator()
            .send();
        while let Some(page) = pages.next().await {
            keys.extend(
                page?
                    .contents()
                    .iter()
                    .filter_map(|item| item.key().map(String::from)),
            );
        }
        Ok(keys)
    }

    pub async fn list_files(&self, folder: &str) -> Result<Vec<String>> {
        let keys = self.list_keys(folder).await?;
        // Only a site's root, like brave-otter-1a2b/, has version folders inside it
        if folder.matches('/').count() > 1 {
            return Ok(keys);
        }
        Ok(keys
            .into_iter()
            .filter(|key| !starts_with_version_folder(&key[folder.len()..]))
            .collect())
    }

    async fn delete_keys(&self, keys: &[String]) -> Result<()> {
        // DeleteObjects takes up to 1000 keys at a time
        for batch in keys.chunks(1000) {
            let objects = batch
                .iter()
                .map(|key| ObjectIdentifier::builder().key(key).build())
                .collect::<Result<Vec<_>, _>>()?;
            let delete = Delete::builder()
                .set_objects(Some(objects))
                .quiet(true)
                .build()?;
            let result = self
                .client
                .delete_objects()
                .bucket(&self.bucket)
                .delete(delete)
                .send()
                .await?;
            // Failures for individual keys still come back as a 200
            if !result.errors().is_empty() {
                bail!("Could not delete {} objects", result.errors().len());
            }
        }
        Ok(())
    }

    async fn read_head(&self, key: &str) -> Result<Option<StoredObject>> {
        let request = self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(key)
            .checksum_mode(ChecksumMode::Enabled);
        match request.send().await {
            Ok(head) => Ok(Some(StoredObject {
                sha256: head.checksum_sha256().map(String::from),
                size: head.content_length().unwrap_or(0),
                original_sha256: None,
            })),
            // Deleted since it was listed, like by a cancelled upload
            Err(error)
                if error.as_service_error().is_some_and(|error| {
                    error.is_not_found() || error.code() == Some("NoSuchKey")
                }) =>
            {
                Ok(None)
            }
            Err(error) => Err(error.into()),
        }
    }

    /// A folder's files, by path inside it. Listings leave out checksums, so every
    /// object is read on its own.
    pub async fn read_objects(&self, folder: &str) -> Result<BTreeMap<String, StoredObject>> {
        let keys = self.list_files(folder).await?;
        let heads = limited(keys.iter().map(|key| self.read_head(key)), CONCURRENCY).await?;
        Ok(keys
            .iter()
            .zip(heads)
            .filter_map(|(key, head)| Some((key[folder.len()..].to_owned(), head?)))
            .collect())
    }

    /// The bucket's site folders, a listing page (up to 1000) at a time, starting
    /// after the token the page before gave.
    pub async fn slug_page(&self, after: Option<String>) -> Result<(Vec<String>, Option<String>)> {
        let page = self
            .client
            .list_objects_v2()
            .bucket(&self.bucket)
            .delimiter("/")
            .set_continuation_token(after)
            .send()
            .await?;
        let slugs = page
            .common_prefixes()
            .iter()
            .filter_map(|prefix| prefix.prefix())
            .map(|prefix| prefix.strip_suffix('/').unwrap_or(prefix).to_owned())
            .collect();
        let next = if page.is_truncated() == Some(true) {
            page.next_continuation_token().map(String::from)
        } else {
            None
        };
        Ok((slugs, next))
    }

    pub async fn delete_folder(&self, folder: &str) -> Result<()> {
        self.delete_keys(&self.list_files(folder).await?).await
    }

    pub async fn delete_paths(&self, folder: &str, paths: &[String]) -> Result<()> {
        let keys: Vec<String> = paths.iter().map(|path| format!("{folder}{path}")).collect();
        self.delete_keys(&keys).await
    }

    pub async fn delete_site(&self, slug: &str) -> Result<()> {
        self.delete_keys(&self.list_keys(&format!("{slug}/")).await?)
            .await
    }

    pub async fn delete_sites(&self, slugs: &[String]) -> Result<()> {
        // Each lists and deletes on its own, so only a few go at once
        limited(slugs.iter().map(|slug| self.delete_site(slug)), 4).await?;
        Ok(())
    }

    /// Copies keep their checksum, type, and encoding, so they check out like uploads.
    pub async fn copy_files(&self, source: &str, target: &str, paths: &[String]) -> Result<()> {
        let copies = paths.iter().map(|path| async move {
            let source = format!(
                "{}/{}",
                self.bucket,
                utf8_percent_encode(&format!("{source}{path}"), KEY_UNESCAPED)
            );
            let copy = self
                .client
                .copy_object()
                .bucket(&self.bucket)
                .key(format!("{target}{path}"))
                .copy_source(source);
            copy.send().await?;
            Ok(())
        });
        limited(copies, CONCURRENCY).await?;
        Ok(())
    }
}

// What a copy source's key keeps as it is, as boto3 quotes it
const KEY_UNESCAPED: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'/')
    .remove(b'~')
    .remove(b'-')
    .remove(b'_')
    .remove(b'.');

#[derive(Serialize)]
pub struct UploadPolicy {
    /// Path from the manifest
    pub path: String,
    /// Form fields to send before the file
    pub fields: Map<String, Value>,
}

/// Signs a browser upload (an S3 POST policy) for each file, returning where to POST them.
pub fn sign_uploads(
    settings: &Settings,
    folder: &str,
    files: &[&ManifestFile],
) -> (String, Vec<UploadPolicy>) {
    if files.is_empty() {
        return (String::new(), Vec::new());
    }
    // Browsers upload to the public endpoint, so policies are signed for it
    let url = format!(
        "{}/{}",
        settings.s3_public_endpoint.as_str().trim_end_matches('/'),
        settings.s3_bucket
    );
    let now = Utc::now();
    let uploads = files
        .iter()
        .map(|file| {
            let mut fields = vec![
                ("Content-Type", content_type(&file.path)),
                ("x-amz-checksum-algorithm", "SHA256".into()),
                ("x-amz-checksum-sha256", file.sha256.clone()),
            ];
            if file.gzip {
                fields.push(("Content-Encoding", "gzip".into()));
            }
            let key = format!("{folder}{}", file.path);
            UploadPolicy {
                path: file.path.clone(),
                fields: presigned_post(settings, now, &key, fields, file.size),
            }
        })
        .collect();
    (url, uploads)
}

/// The form fields of a SigV4 POST policy, as boto3's generate_presigned_post makes
/// them: the given fields, which the policy requires as they are, and an exact size.
fn presigned_post(
    settings: &Settings,
    now: DateTime<Utc>,
    key: &str,
    fields: Vec<(&str, String)>,
    size: i64,
) -> Map<String, Value> {
    let date = now.format("%Y%m%d").to_string();
    let timestamp = now.format("%Y%m%dT%H%M%SZ").to_string();
    let credential = format!(
        "{}/{date}/{}/s3/aws4_request",
        settings.s3_access_key_id, settings.s3_region
    );
    // Whole seconds, so a negative window makes policies that are already expired
    let expiration = now + TimeDelta::seconds(settings.upload_window.num_seconds());

    let mut conditions: Vec<Value> = fields
        .iter()
        .map(|(name, value)| json!({ *name: value }))
        .collect();
    conditions.push(json!(["content-length-range", size, size]));
    conditions.push(json!({"bucket": settings.s3_bucket}));
    conditions.push(json!({"key": key}));
    conditions.push(json!({"x-amz-algorithm": "AWS4-HMAC-SHA256"}));
    conditions.push(json!({"x-amz-credential": credential}));
    conditions.push(json!({"x-amz-date": timestamp}));
    let policy = json!({
        "expiration": expiration.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        "conditions": conditions,
    });
    let policy = BASE64.encode(policy.to_string());

    let mut form: Map<String, Value> = fields
        .into_iter()
        .map(|(name, value)| (name.to_owned(), value.into()))
        .collect();
    form.insert("key".into(), key.into());
    form.insert("x-amz-algorithm".into(), "AWS4-HMAC-SHA256".into());
    form.insert("x-amz-credential".into(), credential.into());
    form.insert("x-amz-date".into(), timestamp.into());
    let signature = signature(settings, &date, &policy);
    form.insert("policy".into(), policy.into());
    form.insert("x-amz-signature".into(), signature.into());
    form
}

/// SigV4's signature over a POST policy, with the key derived for the day and region.
fn signature(settings: &Settings, date: &str, policy: &str) -> String {
    let secret = format!("AWS4{}", settings.s3_secret_access_key);
    let mut key = hmac(secret.as_bytes(), date);
    for part in [settings.s3_region.as_str(), "s3", "aws4_request", policy] {
        key = hmac(&key, part);
    }
    hex::encode(key)
}

fn hmac(key: &[u8], data: &str) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC takes keys of any size");
    mac.update(data.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_types() {
        assert_eq!(content_type("index.html"), "text/html");
        assert_eq!(content_type("assets/app.js"), "text/javascript");
        assert_eq!(content_type("fonts/inter.woff2"), "font/woff2");
        assert_eq!(content_type("archive.tar.gz"), "application/octet-stream");
        assert_eq!(content_type("LICENSE"), "application/octet-stream");
    }

    #[tokio::test]
    async fn limited_caps_how_many_run_at_once() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let running = AtomicUsize::new(0);
        let most = AtomicUsize::new(0);
        let calls: Vec<_> = (0..100)
            .map(|i| {
                let (running, most) = (&running, &most);
                async move {
                    let now = running.fetch_add(1, Ordering::SeqCst) + 1;
                    most.fetch_max(now, Ordering::SeqCst);
                    tokio::task::yield_now().await;
                    running.fetch_sub(1, Ordering::SeqCst);
                    Ok(i)
                }
            })
            .collect();
        assert_eq!(
            limited(calls, 7).await.unwrap(),
            (0..100).collect::<Vec<_>>()
        );
        assert_eq!(most.load(Ordering::SeqCst), 7);
    }
}
