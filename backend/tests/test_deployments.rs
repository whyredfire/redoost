mod common;

use std::collections::BTreeSet;
use std::time::Duration as StdDuration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use chrono::{Duration, SubsecRound, TimeDelta, Utc};
use common::{ANONYMOUS, Reply, TestApp, digest, time};
use serde_json::{Value, json};

const URL: &str = "/api/deployments";
// What every test file holds, unless a test says otherwise
const CONTENT: &[u8] = b"x";

fn sha256() -> String {
    digest(CONTENT)
}

fn other_sha256() -> String {
    digest(b"other")
}

fn original_sha256() -> String {
    digest(b"original")
}

fn manifest(paths: &[&str]) -> Value {
    manifest_sized(paths, 1)
}

fn manifest_sized(paths: &[&str], size: u64) -> Value {
    let files: Vec<_> = paths
        .iter()
        .map(|path| json!({"path": path, "size": size, "sha256": sha256()}))
        .collect();
    json!({"files": files})
}

/// Adds fields to a manifest, like a description.
fn with(mut manifest: Value, fields: Value) -> Value {
    let fields = fields.as_object().unwrap().clone();
    manifest.as_object_mut().unwrap().extend(fields);
    manifest
}

/// A site as the response that created or updated it shows it, and who owns it.
struct Site {
    token: String,
    body: Value,
}

impl Site {
    fn slug(&self) -> &str {
        self.body["slug"].as_str().unwrap()
    }

    fn url(&self) -> String {
        format!("{URL}/{}", self.slug())
    }

    /// The version folder the response's uploads go to.
    fn folder(&self) -> String {
        folder_of(&self.body)
    }
}

fn folder_of(body: &Value) -> String {
    let upload = &body["uploads"][0];
    let key = upload["fields"]["key"].as_str().unwrap();
    key.strip_suffix(upload["path"].as_str().unwrap())
        .unwrap()
        .to_string()
}

/// Whether a slug has the shape Nginx takes, like brave-otter-1a2b.
fn is_slug(slug: &str) -> bool {
    let parts: Vec<_> = slug.split('-').collect();
    let (tail, words) = parts.split_last().unwrap();
    slug.len() <= 63
        && words.len() >= 2
        && words
            .iter()
            .all(|word| !word.is_empty() && word.bytes().all(|b| b.is_ascii_lowercase()))
        && tail.len() == 4
        && tail
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Whether a folder is a version folder of the site, like brave-otter-1a2b/v-0123456789ab/.
fn is_version_folder(folder: &str, slug: &str) -> bool {
    let Some(id) = folder
        .strip_prefix(&format!("{slug}/v-"))
        .and_then(|rest| rest.strip_suffix('/'))
    else {
        return false;
    };
    id.len() == 12
        && id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

async fn create(app: &TestApp, token: &str, paths: &[&str]) -> Site {
    let response = app.post(URL, token, manifest(paths)).await;
    Site {
        token: token.to_string(),
        body: response.body,
    }
}

/// Uploads every file a response has a policy for.
async fn upload_all(app: &TestApp, body: &Value) {
    for upload in body["uploads"].as_array().unwrap() {
        let path = upload["path"].as_str().unwrap();
        assert_eq!(app.upload(body, path, CONTENT).await, 204, "{path}");
    }
}

async fn complete(app: &TestApp, site: &Site, paths: &[&str]) -> Reply {
    let url = format!("{}/complete", site.url());
    app.post(&url, &site.token, manifest(paths)).await
}

async fn published(app: &TestApp, token: &str, paths: &[&str]) -> Site {
    let site = create(app, token, paths).await;
    upload_all(app, &site.body).await;
    assert_eq!(complete(app, &site, paths).await.status, 200);
    site
}

async fn update(app: &TestApp, site: &Site, paths: &[&str]) -> Reply {
    app.put(&site.url(), &site.token, manifest(paths)).await
}

/// Updates a published site to these files and completes the update.
async fn update_site(app: &TestApp, site: &Site, paths: &[&str]) -> Value {
    let updated = update(app, site, paths).await;
    assert_eq!(updated.status, 200);
    upload_all(app, &updated.body).await;
    let response = complete(app, site, paths).await;
    assert_eq!(response.status, 200);
    response.body
}

async fn cancel(app: &TestApp, site: &Site) -> Reply {
    app.post(&format!("{}/cancel", site.url()), &site.token, Value::Null)
        .await
}

async fn usage(app: &TestApp, token: &str) -> i64 {
    app.get(&format!("{URL}/usage"), token).await.body["used"]
        .as_i64()
        .unwrap()
}

async fn resolve(app: &TestApp, slug: &str) -> Reply {
    app.get(&format!("/internal/sites/{slug}"), ANONYMOUS).await
}

/// The site root Nginx gets for a folder, like /brave-otter-1a2b/v-0123456789ab.
fn root(folder: &str) -> String {
    format!("/{}", folder.trim_end_matches('/'))
}

/// Folders whose files are recorded for the site.
async fn versions(app: &TestApp, slug: &str) -> BTreeSet<String> {
    sqlx::query_scalar("SELECT folder FROM version WHERE slug = $1")
        .bind(slug)
        .fetch_all(&app.db)
        .await
        .unwrap()
        .into_iter()
        .collect()
}

/// Replaces what the site's current version holds.
async fn serve(app: &TestApp, site: &Site, files: Value) {
    sqlx::query("UPDATE version SET files = $1 WHERE folder = $2")
        .bind(sqlx::types::Json(files))
        .bind(site.folder())
        .execute(&app.db)
        .await
        .unwrap();
}

/// As if the versions stopped being served long enough ago that Nginx's cache moved on.
async fn retire_long_ago(app: &TestApp) {
    sqlx::query("UPDATE version SET retired_at = retired_at - interval '1 hour'")
        .execute(&app.db)
        .await
        .unwrap();
}

/// Upload policies that expired before they were signed.
fn closed_window(settings: &mut redoost_api::config::Settings) {
    settings.upload_window = TimeDelta::seconds(-1);
}

fn open_window(settings: &mut redoost_api::config::Settings) {
    settings.upload_window = TimeDelta::hours(1);
}

#[tokio::test]
async fn create_deployment() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let files = json!([
        {"path": "index.html", "size": 10, "sha256": sha256()},
        {"path": "assets/app.js", "size": 20, "sha256": sha256()},
        {"path": ".well-known/security.txt", "size": 0, "sha256": sha256()},
        {"path": "docs/café menu.html", "size": 5, "sha256": sha256()},
    ]);
    let response = app.post(URL, &token, json!({"files": files})).await;

    assert_eq!(response.status, 201);
    let body = response.body;
    assert!(is_slug(body["slug"].as_str().unwrap()), "{}", body["slug"]);
    assert_eq!(body["state"], "uploading");
    assert!(time(&body["locked_until"]) > Utc::now());
    assert_eq!(body["file_count"], 4);
    assert_eq!(body["total_size"], 35);
    assert!(body.get("token").is_none() && body.get("owner_id").is_none());
}

#[tokio::test]
async fn create_deployment_requires_a_user() {
    let app = TestApp::start().await;
    assert_eq!(
        app.post(URL, ANONYMOUS, manifest(&["index.html"]))
            .await
            .status,
        401
    );
    assert_eq!(
        app.post(URL, "x", manifest(&["index.html"])).await.status,
        401
    );
}

#[tokio::test]
async fn create_deployment_signs_one_policy_per_file() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let body = app
        .post(
            URL,
            &token,
            manifest_sized(&["index.html", "assets/app.js"], 5),
        )
        .await
        .body;

    let settings = app.settings();
    let endpoint = settings.s3_public_endpoint.as_str().trim_end_matches('/');
    assert_eq!(
        body["upload_url"],
        format!("{endpoint}/{}", settings.s3_bucket)
    );
    let paths: Vec<_> = body["uploads"]
        .as_array()
        .unwrap()
        .iter()
        .map(|u| &u["path"])
        .collect();
    assert_eq!(paths, ["index.html", "assets/app.js"]);

    let fields = &body["uploads"][1]["fields"];
    let key = fields["key"].as_str().unwrap();
    let folder = key.strip_suffix("assets/app.js").unwrap();
    assert!(
        is_version_folder(folder, body["slug"].as_str().unwrap()),
        "{key}"
    );
    assert_eq!(fields["Content-Type"], "text/javascript");
    assert_eq!(fields["x-amz-checksum-sha256"], sha256());

    let policy: Value =
        serde_json::from_slice(&STANDARD.decode(fields["policy"].as_str().unwrap()).unwrap())
            .unwrap();
    let conditions = policy["conditions"].as_array().unwrap();
    for condition in [
        json!({"bucket": settings.s3_bucket}),
        json!({"key": key}),
        json!({"Content-Type": "text/javascript"}),
        json!({"x-amz-checksum-algorithm": "SHA256"}),
        json!({"x-amz-checksum-sha256": sha256()}),
        json!(["content-length-range", 5, 5]),
    ] {
        assert!(
            conditions.contains(&condition),
            "{condition} in {conditions:?}"
        );
    }
    let expires_in = time(&policy["expiration"]) - Utc::now();
    assert!(Duration::minutes(59) < expires_in && expires_in <= Duration::hours(1));
}

#[tokio::test]
async fn signs_content_encoding_for_gzipped_files() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let files = json!([
        {"path": "index.html", "size": 5, "sha256": sha256(), "gzip": true},
        {"path": "logo.png", "size": 5, "sha256": sha256()},
    ]);
    let body = app.post(URL, &token, json!({"files": files})).await.body;

    let gzipped = &body["uploads"][0]["fields"];
    let plain = &body["uploads"][1]["fields"];
    assert_eq!(gzipped["Content-Encoding"], "gzip");
    let policy: Value = serde_json::from_slice(
        &STANDARD
            .decode(gzipped["policy"].as_str().unwrap())
            .unwrap(),
    )
    .unwrap();
    assert!(
        policy["conditions"]
            .as_array()
            .unwrap()
            .contains(&json!({"Content-Encoding": "gzip"}))
    );
    assert!(plain.get("Content-Encoding").is_none());
}

#[tokio::test]
async fn files_get_their_content_types() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let expected = [
        ("index.html", "text/html"),
        ("assets/app.js", "text/javascript"),
        ("fonts/inter.woff2", "font/woff2"),
        // Compressed files would otherwise get the type of their contents
        ("archive.tar.gz", "application/octet-stream"),
        ("LICENSE", "application/octet-stream"),
    ];
    let paths: Vec<_> = expected.iter().map(|(path, _)| *path).collect();
    let body = app.post(URL, &token, manifest(&paths)).await.body;

    for (upload, (path, content_type)) in body["uploads"].as_array().unwrap().iter().zip(expected) {
        assert_eq!(upload["fields"]["Content-Type"], content_type, "{path}");
    }
}

#[tokio::test]
async fn slugs_are_unique() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let mut slugs = BTreeSet::new();
    for _ in 0..20 {
        slugs.insert(
            create(&app, &token, &["index.html"])
                .await
                .slug()
                .to_string(),
        );
    }

    assert_eq!(slugs.len(), 20);
}

#[tokio::test]
async fn offers_addresses_to_pick_from() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let url = format!("{URL}/slugs");
    assert_eq!(app.get(&url, ANONYMOUS).await.status, 401);

    let response = app.get(&url, &token).await;
    assert_eq!(response.status, 200);
    let slugs: BTreeSet<String> = serde_json::from_value(response.body).unwrap();
    assert_eq!(slugs.len(), 4);
    assert!(slugs.iter().all(|slug| is_slug(slug)), "{slugs:?}");
    // Another batch, for whoever wants other options
    let more: BTreeSet<String> = serde_json::from_value(app.get(&url, &token).await.body).unwrap();
    assert!(slugs.is_disjoint(&more));
}

#[tokio::test]
async fn publishes_at_the_picked_address() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let slug = app.get(&format!("{URL}/slugs"), &token).await.body[0].clone();
    let site = with(manifest(&["index.html"]), json!({"slug": slug}));

    let response = app.post(URL, &token, site.clone()).await;
    assert_eq!(response.status, 201);
    assert_eq!(response.body["slug"], slug);
    // Taken now, by anyone
    assert_eq!(app.post(URL, &token, site).await.status, 409);
}

#[tokio::test]
async fn publishes_only_at_offered_addresses() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let publish = async |slug: &Value| {
        let site = with(manifest(&["index.html"]), json!({"slug": slug}));
        app.post(URL, &token, site).await.status
    };

    // Well-formed, but never offered
    assert_eq!(publish(&json!("brave-otter-1a2b")).await, 409);
    // Offered to someone else
    let other = app.new_token().await;
    let slug = app.get(&format!("{URL}/slugs"), &other).await.body[0].clone();
    assert_eq!(publish(&slug).await, 409);
}

#[tokio::test]
async fn offers_lapse() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let slug = app.get(&format!("{URL}/slugs"), &token).await.body[0].clone();
    let offered = async || -> bool {
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM slug_offer WHERE slug = $1)")
            .bind(slug.as_str().unwrap())
            .fetch_one(&app.db)
            .await
            .unwrap()
    };

    sqlx::query("UPDATE slug_offer SET expires_at = now() - interval '1 second' WHERE slug = $1")
        .bind(slug.as_str().unwrap())
        .execute(&app.db)
        .await
        .unwrap();
    let site = with(manifest(&["index.html"]), json!({"slug": slug}));
    assert_eq!(app.post(URL, &token, site).await.status, 409);
    assert!(offered().await);
    app.cleanup().await;
    assert!(!offered().await);
}

#[tokio::test]
async fn rejects_malformed_addresses() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    for slug in [
        "Brave-Otter-1a2b",
        "otter-1a2b",
        "brave-otter",
        "brave-otter-1a2b/",
        "",
    ] {
        let site = with(manifest(&["index.html"]), json!({"slug": slug}));
        assert_eq!(app.post(URL, &token, site).await.status, 422, "{slug}");
    }
}

#[tokio::test]
async fn read_deployment_requires_its_owner() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = create(&app, &token, &["index.html"]).await;

    assert_eq!(app.get(&site.url(), ANONYMOUS).await.status, 401);
    assert_eq!(app.get(&site.url(), "wrong").await.status, 401);
    assert_eq!(
        app.get(&site.url(), &app.new_token().await).await.status,
        403
    );

    let response = app.get(&site.url(), &token).await;
    assert_eq!(response.status, 200);
    assert_eq!(response.body["slug"], site.slug());
    assert!(response.body.get("token").is_none());
}

#[tokio::test]
async fn read_limits() {
    let app = TestApp::start().await;
    let response = app.get(&format!("{URL}/limits"), ANONYMOUS).await;

    let settings = app.settings();
    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "max_file_size": settings.max_file_size,
            "max_deployment_size": settings.max_deployment_size,
            "max_deployment_files": settings.max_deployment_files,
        })
    );
}

#[tokio::test]
async fn read_unknown_deployment() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    assert_eq!(
        app.get(&format!("{URL}/missing-slug"), &token).await.status,
        404
    );
}

#[tokio::test]
async fn rejects_invalid_paths() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let long = "x".repeat(901);
    for path in [
        "/index.html",
        "../index.html",
        "assets/../index.html",
        "./index.html",
        "assets//app.js",
        "assets/",
        "assets\\app.js",
        "assets/app\n.js",
        &long,
    ] {
        let response = app.post(URL, &token, manifest(&["index.html", path])).await;
        assert_eq!(response.status, 422, "{path:?}");
    }
}

#[tokio::test]
async fn rejects_invalid_manifests() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    for body in [
        json!({"files": []}),
        manifest(&["index.html", "index.html"]),
        manifest(&["docs/index.html"]),
        json!({"files": [{"path": "index.html", "size": -1, "sha256": sha256()}]}),
    ] {
        assert_eq!(
            app.post(URL, &token, body.clone()).await.status,
            422,
            "{body}"
        );
    }
}

#[tokio::test]
async fn rejects_huge_bodies() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    // Bodies are read before requests are authenticated, so anyone could send one
    let response = app
        .http
        .post(format!("{}{URL}", app.url))
        .bearer_auth(&token)
        .header("Content-Type", "application/json")
        .body(vec![b'x'; 8 * 1024 * 1024 + 1])
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), 413);
}

#[tokio::test]
async fn rejects_invalid_checksums() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let valid = sha256();
    for checksum in [
        String::new(),
        // Hex rather than base64
        "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881".to_string(),
        valid.trim_end_matches('=').to_string(),
        format!("{}!=", &valid[..valid.len() - 2]),
        // SHA-1 of nothing
        "2jmj7l5rSw0yVb/vlWAYkK/YBwk=".to_string(),
    ] {
        let body = json!({"files": [{"path": "index.html", "size": 1, "sha256": checksum}]});
        assert_eq!(app.post(URL, &token, body).await.status, 422, "{checksum}");
    }
}

#[tokio::test]
async fn enforces_limits() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let settings = app.settings();
    let max_file_size = settings.max_file_size;
    let numbered = |count: u64, extension: &str| -> Vec<String> {
        (0..count).map(|i| format!("{i}.{extension}")).collect()
    };
    let paths = |names: &[String]| -> Vec<String> {
        [vec!["index.html".to_string()], names.to_vec()].concat()
    };
    let too_many = paths(&numbered(settings.max_deployment_files as u64, "txt"));
    let count = settings.max_deployment_size / max_file_size + 1;
    let too_much = paths(&numbered(count - 1, "bin"));

    for body in [
        manifest(&too_many.iter().map(String::as_str).collect::<Vec<_>>()),
        manifest_sized(&["index.html"], max_file_size + 1),
        manifest_sized(
            &too_much.iter().map(String::as_str).collect::<Vec<_>>(),
            max_file_size,
        ),
    ] {
        assert_eq!(app.post(URL, &token, body).await.status, 422);
    }
}

#[tokio::test]
async fn complete_marks_deployment_ready() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = create(&app, &token, &["index.html", "app.js"]).await;
    upload_all(&app, &site.body).await;

    let response = complete(&app, &site, &["index.html", "app.js"]).await;
    assert_eq!(response.status, 200);
    assert_eq!(response.body["state"], "ready");
    assert!(time(&response.body["locked_until"]) <= Utc::now());

    // Repeating a completion succeeds while the files still match
    assert_eq!(
        complete(&app, &site, &["index.html", "app.js"])
            .await
            .status,
        200
    );
    assert_eq!(complete(&app, &site, &["index.html"]).await.status, 410);
}

#[tokio::test]
async fn complete_rejects_missing_files() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let missing = create(&app, &token, &["index.html", "app.js"]).await;
    assert_eq!(app.upload(&missing.body, "index.html", CONTENT).await, 204);
    let different = create(&app, &token, &["index.html", "app.js"]).await;
    for path in ["index.html", "app.js"] {
        app.put_object(&format!("{}{path}", different.folder()), b"other")
            .await;
    }

    for site in [missing, different] {
        let response = complete(&app, &site, &["index.html", "app.js"]).await;
        assert_eq!(response.status, 409);
        let detail = response.body["detail"].as_str().unwrap();
        assert!(detail.ends_with("of 2 files uploaded"), "{detail}");
    }
}

#[tokio::test]
async fn complete_rejects_understated_sizes() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    // The checksum matches, but the stored file is bigger than declared
    let content = b"0123456789";
    let site = json!({"files": [{"path": "index.html", "size": 1, "sha256": digest(content)}]});
    let created = app.post(URL, &token, site.clone()).await.body;
    app.put_object(&format!("{}index.html", folder_of(&created)), content)
        .await;
    let url = format!("{URL}/{}", created["slug"].as_str().unwrap());

    let response = app.post(&format!("{url}/complete"), &token, site).await;
    assert_eq!(response.status, 409);
    assert_eq!(app.get(&url, &token).await.body["state"], "uploading");
}

#[tokio::test]
async fn complete_only_publishes_the_signed_files() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    // Otherwise the policies left over for big.bin could fill the live folder
    let site = create(&app, &token, &["index.html", "big.bin"]).await;
    assert_eq!(app.upload(&site.body, "index.html", CONTENT).await, 204);

    let response = complete(&app, &site, &["index.html"]).await;
    assert_eq!(response.status, 409);
    assert_eq!(
        app.get(&site.url(), &token).await.body["state"],
        "uploading"
    );
}

#[tokio::test]
async fn rejects_paths_named_like_version_folders() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let response = app
        .post(
            URL,
            &token,
            manifest(&["index.html", "v-0123456789ab/blob"]),
        )
        .await;
    assert_eq!(response.status, 422);
}

#[tokio::test]
async fn complete_checks_storage_again() {
    let mut app = TestApp::start().await;
    let token = app.new_token().await;
    let site = create(&app, &token, &["index.html"]).await;
    let other = create(&app, &token, &["index.html"]).await;
    upload_all(&app, &site.body).await;
    upload_all(&app, &other.body).await;
    complete(&app, &other, &["index.html"]).await;
    // As if the other site had finished first and used up what's left
    app.reconfigure(|settings| settings.max_account_size = 1)
        .await;

    let response = complete(&app, &site, &["index.html"]).await;
    assert_eq!(response.status, 403);
    assert_eq!(
        response.body["detail"],
        "Your sites can use up to 1B in total"
    );
}

#[tokio::test]
async fn complete_rejects_closed_upload_window() {
    let app = TestApp::start_with(closed_window).await;
    let token = app.new_token().await;
    let site = create(&app, &token, &["index.html"]).await;
    app.put_object(&format!("{}index.html", site.folder()), CONTENT)
        .await;

    assert_eq!(complete(&app, &site, &["index.html"]).await.status, 410);
}

#[tokio::test]
async fn complete_requires_its_owner() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = create(&app, &token, &["index.html"]).await;
    let other = Site {
        token: app.new_token().await,
        body: site.body,
    };

    assert_eq!(complete(&app, &other, &["index.html"]).await.status, 403);
}

#[tokio::test]
async fn read_files() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html", "app.js"]).await;
    let url = format!("{}/files", site.url());

    assert_eq!(app.get(&url, &app.new_token().await).await.status, 403);
    // Recorded when it was published, so storage isn't read again
    for path in ["index.html", "app.js"] {
        app.s3
            .delete_object()
            .bucket(&app.settings().s3_bucket)
            .key(format!("{}{path}", site.folder()))
            .send()
            .await
            .unwrap();
    }
    let response = app.get(&url, &token).await;
    // Files sent as they are hash the same before compression
    assert_eq!(
        response.body,
        json!([
            {"path": "app.js", "sha256": sha256(), "original_sha256": sha256()},
            {"path": "index.html", "sha256": sha256(), "original_sha256": sha256()},
        ])
    );
}

#[tokio::test]
async fn versions_without_recorded_files_are_uploaded_again() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;

    sqlx::query("DELETE FROM version WHERE folder = $1")
        .bind(site.folder())
        .execute(&app.db)
        .await
        .unwrap();
    let response = app.get(&format!("{}/files", site.url()), &token).await;
    assert_eq!(response.body, json!([]));
    let updated = update(&app, &site, &["index.html"]).await.body;
    assert_eq!(updated["uploads"][0]["path"], "index.html");
    assert_eq!(updated["uploads"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn update_signs_only_new_and_changed_files() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html", "app.js", "old.js"]).await;
    serve(
        &app,
        &site,
        json!({
            "index.html": {"sha256": sha256(), "size": 1},
            "app.js": {"sha256": other_sha256(), "size": 1},
            // Same checksum, but not the size the manifest declares
            "about.html": {"sha256": sha256(), "size": 5},
            "old.js": {"sha256": sha256(), "size": 1},
        }),
    )
    .await;

    let response = update(
        &app,
        &site,
        &["index.html", "app.js", "about.html", "new.js"],
    )
    .await;

    assert_eq!(response.status, 200);
    let body = response.body;
    let paths: Vec<_> = body["uploads"]
        .as_array()
        .unwrap()
        .iter()
        .map(|u| &u["path"])
        .collect();
    assert_eq!(paths, ["app.js", "about.html", "new.js"]);
    // Into a folder of its own, while the site keeps serving its current one
    let folder = folder_of(&body);
    assert_eq!(
        body["uploads"][0]["fields"]["key"],
        format!("{folder}app.js")
    );
    assert_ne!(folder, site.folder());
    assert!(time(&body["locked_until"]) > Utc::now());
    assert!(body.get("token").is_none());
}

#[tokio::test]
async fn updates_compare_files_as_they_were_before_compression() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let gzipped = |sha256: String, size: u64, original: String| {
        json!({"files": [{
            "path": "index.html", "size": size, "sha256": sha256, "gzip": true,
            "original_sha256": original,
        }]})
    };
    let first = gzipped(sha256(), 1, original_sha256());
    let created = app.post(URL, &token, first.clone()).await.body;
    let site = Site {
        token: token.clone(),
        body: created,
    };
    upload_all(&app, &site.body).await;
    app.post(&format!("{}/complete", site.url()), &token, first)
        .await;

    // Another client compressed the same file to other bytes
    let other = gzipped(other_sha256(), 2, original_sha256());
    let updated = app.put(&site.url(), &token, other.clone()).await.body;
    assert_eq!(updated["uploads"], json!([]));
    let response = app
        .post(&format!("{}/complete", site.url()), &token, other)
        .await;

    assert_eq!(response.status, 200);
    // Copied from the version it replaced, with the first client's bytes
    let served = resolve(&app, site.slug())
        .await
        .header("x-site-root")
        .to_string();
    let copied = format!("{}/index.html", &served[1..]);
    assert_ne!(served, root(&site.folder()));
    assert_eq!(
        app.keys(&format!("{}/", &served[1..])).await,
        [copied.as_str()]
    );
    let head = app.head(&copied).await.unwrap();
    assert_eq!(head.checksum_sha256(), Some(sha256().as_str()));
    let files = app.get(&format!("{}/files", site.url()), &token).await.body;
    assert_eq!(
        files,
        json!([{"path": "index.html", "sha256": sha256(), "original_sha256": original_sha256()}])
    );

    let changed = gzipped(sha256(), 1, other_sha256());
    let updated = app.put(&site.url(), &token, changed).await.body;
    assert_eq!(updated["uploads"][0]["path"], "index.html");
}

#[tokio::test]
async fn one_upload_at_a_time() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;

    assert_eq!(update(&app, &site, &["index.html"]).await.status, 200);
    let response = update(&app, &site, &["index.html"]).await;
    assert_eq!(response.status, 409);
    assert_eq!(
        response.body["detail"],
        "Another upload to this site is in progress"
    );

    // Completing or cancelling frees the site again
    assert_eq!(complete(&app, &site, &["index.html"]).await.status, 200);
    assert_eq!(update(&app, &site, &["index.html"]).await.status, 200);
    assert_eq!(cancel(&app, &site).await.status, 204);
    assert_eq!(
        complete(&app, &site, &["index.html", "app.js"])
            .await
            .status,
        410
    );
    assert_eq!(update(&app, &site, &["index.html"]).await.status, 200);
}

#[tokio::test]
async fn update_requires_a_published_site() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = create(&app, &token, &["index.html"]).await;

    let response = update(&app, &site, &["index.html"]).await;
    assert_eq!(response.status, 409);
    assert_eq!(response.body["detail"], "Site isn't published yet");
}

#[tokio::test]
async fn update_requires_its_owner() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = create(&app, &token, &["index.html"]).await;
    let other = Site {
        token: app.new_token().await,
        body: site.body,
    };

    assert_eq!(update(&app, &other, &["index.html"]).await.status, 403);
    assert_eq!(cancel(&app, &other).await.status, 403);
}

#[tokio::test]
async fn completing_an_update_switches_folders() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html", "old.html"]).await;
    let served = site.folder();
    assert_eq!(
        resolve(&app, site.slug()).await.header("x-site-root"),
        root(&served)
    );
    let updated = update(&app, &site, &["index.html", "404.html"]).await.body;
    let folder = folder_of(&updated);
    // Only the new file is uploaded, and it counts until the update finishes
    assert_eq!(updated["uploads"].as_array().unwrap().len(), 1);
    assert_eq!(updated["uploads"][0]["path"], "404.html");
    assert_eq!(usage(&app, &token).await, 3);

    upload_all(&app, &updated).await;
    let response = complete(&app, &site, &["index.html", "404.html"]).await;

    assert_eq!(response.status, 200);
    let body = response.body;
    assert_eq!(body["file_count"], 2);
    assert_eq!(body["spa"], false);
    // The unchanged file was copied over
    assert_eq!(
        app.keys(&folder).await,
        [format!("{folder}404.html"), format!("{folder}index.html")]
    );
    let resolved = resolve(&app, site.slug()).await;
    assert_eq!(resolved.header("x-site-root"), root(&folder));
    assert_eq!(resolved.header("x-site-spa"), "0");
    // The old version is kept to go back to, and counts in full
    assert!(!app.keys(&served).await.is_empty());
    assert_eq!(body["version_count"], 2);
    assert_eq!(body["storage_size"], 4);
    assert_eq!(usage(&app, &token).await, 4);
    assert_eq!(
        versions(&app, site.slug()).await,
        BTreeSet::from([served.clone(), folder])
    );

    let listed = app
        .get(&format!("{}/versions", site.url()), &token)
        .await
        .body;
    let summary: Vec<_> = listed
        .as_array()
        .unwrap()
        .iter()
        .map(|v| {
            (
                v["current"].clone(),
                v["size"].clone(),
                v["file_count"].clone(),
            )
        })
        .collect();
    assert_eq!(
        summary,
        [
            (json!(true), json!(2), json!(2)),
            (json!(false), json!(2), json!(2))
        ]
    );
    assert_eq!(
        format!("{}/{}/", site.slug(), listed[1]["id"].as_str().unwrap()),
        served
    );
}

#[tokio::test]
async fn versions_can_be_described() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;
    let url = site.url();
    let updated = update(&app, &site, &["index.html", "a.html"]).await;
    assert_eq!(updated.status, 200);
    upload_all(&app, &updated.body).await;
    let body = with(
        manifest(&["index.html", "a.html"]),
        json!({"version_description": " Adds a "}),
    );
    assert_eq!(
        app.post(&format!("{url}/complete"), &token, body)
            .await
            .status,
        200
    );

    let listed = app.get(&format!("{url}/versions"), &token).await.body;
    assert_eq!(listed[0]["description"], "Adds a");
    assert_eq!(listed[1]["description"], "");

    let first = format!("{url}/versions/{}", listed[1]["id"].as_str().unwrap());
    let response = app
        .patch(&first, &token, json!({"description": "Launch"}))
        .await;
    assert_eq!(response.status, 200);
    assert_eq!(response.body["description"], "Launch");
    assert_eq!(response.body["current"], false);
    let listed = app.get(&format!("{url}/versions"), &token).await.body;
    assert_eq!(listed[1]["description"], "Launch");
    let response = app
        .patch(&first, &token, json!({"description": "x".repeat(201)}))
        .await;
    assert_eq!(response.status, 422);
}

#[tokio::test]
async fn pruning_keeps_only_the_served_version() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;
    let first = site.folder();
    update_site(&app, &site, &["index.html", "a.html"]).await;
    update_site(&app, &site, &["index.html", "b.html"]).await;
    assert_eq!(usage(&app, &token).await, 5);

    let response = app
        .delete(&format!("{}/versions", site.url()), &token)
        .await;
    assert_eq!(response.status, 200);
    assert_eq!(response.body["version_count"], 1);
    assert_eq!(response.body["storage_size"], 2);
    assert_eq!(versions(&app, site.slug()).await.len(), 1);
    assert_eq!(usage(&app, &token).await, 2);
    // Both were served within the last minutes, so they wait out Nginx's cache
    assert!(!app.keys(&first).await.is_empty());
    app.cleanup().await;
    assert!(!app.keys(&first).await.is_empty());
    assert!(!versions(&app, site.slug()).await.contains(&first));
}

#[tokio::test]
async fn sites_keep_a_few_versions() {
    let app = TestApp::start_with(|settings| settings.kept_versions = 2).await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;
    let first = site.folder();
    update_site(&app, &site, &["index.html", "a.html"]).await;
    assert!(!app.keys(&first).await.is_empty());

    retire_long_ago(&app).await;
    let body = update_site(&app, &site, &["index.html", "b.html"]).await;
    assert!(app.keys(&first).await.is_empty());
    assert_eq!(body["version_count"], 2);
    assert_eq!(body["storage_size"], 4);
    assert!(!versions(&app, site.slug()).await.contains(&first));
}

#[tokio::test]
async fn restoring_a_version() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;
    let first = site.folder();
    let url = site.url();
    update_site(&app, &site, &["index.html", "404.html"]).await;
    let listed = app.get(&format!("{url}/versions"), &token).await.body;
    let (latest, old) = (&listed[0]["id"], &listed[1]["id"]);
    let stored = app.keys(&format!("{}/", site.slug())).await;

    let restore = |id: &Value| format!("{url}/versions/{}/restore", id.as_str().unwrap());
    let response = app.post(&restore(old), &token, Value::Null).await;
    assert_eq!(response.status, 200);
    let body = response.body;
    assert_eq!(body["file_count"], 1);
    assert_eq!(body["total_size"], 1);
    assert_eq!(body["spa"], true);
    assert_eq!(body["version_count"], 2);
    assert_eq!(
        resolve(&app, site.slug()).await.header("x-site-root"),
        root(&first)
    );
    let listed = app.get(&format!("{url}/versions"), &token).await.body;
    assert_eq!(
        (&listed[0]["id"], &listed[0]["current"]),
        (latest, &json!(false))
    );
    assert_eq!(
        (&listed[1]["id"], &listed[1]["current"]),
        (old, &json!(true))
    );
    // Nothing was copied or deleted
    assert_eq!(app.keys(&format!("{}/", site.slug())).await, stored);

    // Only versions that exist, and never during an upload
    let missing = restore(&json!("v-0123456789ab"));
    assert_eq!(app.post(&missing, &token, Value::Null).await.status, 404);
    update(&app, &site, &["index.html"]).await;
    assert_eq!(
        app.post(&restore(latest), &token, Value::Null).await.status,
        409
    );
}

#[tokio::test]
async fn deleting_a_version() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;
    let url = site.url();
    update_site(&app, &site, &["index.html", "404.html"]).await;
    retire_long_ago(&app).await;
    let listed = app.get(&format!("{url}/versions"), &token).await.body;
    let (current, old) = (&listed[0], listed[1]["id"].as_str().unwrap());

    let current_url = format!("{url}/versions/{}", current["id"].as_str().unwrap());
    assert_eq!(app.delete(&current_url, &token).await.status, 409);
    let old_url = format!("{url}/versions/{old}");
    assert_eq!(app.delete(&old_url, &token).await.status, 204);
    assert!(
        app.keys(&format!("{}/{old}/", site.slug()))
            .await
            .is_empty()
    );
    let listed = app.get(&format!("{url}/versions"), &token).await.body;
    assert_eq!(listed, json!([current]));
    assert_eq!(usage(&app, &token).await, 2);
    assert_eq!(app.delete(&old_url, &token).await.status, 404);
}

#[tokio::test(flavor = "multi_thread")]
async fn deleting_a_version_while_an_update_completes() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;
    let oldest = site.folder();
    update_site(&app, &site, &["index.html", "a.html"]).await;
    let updated = update(&app, &site, &["index.html", "b.html"]).await;
    assert_eq!(updated.status, 200);
    upload_all(&app, &updated.body).await;

    // The dashboard deletes the oldest version while the CLI's completion checks files
    let mut deleting = app.db.begin().await.unwrap();
    sqlx::query("SELECT slug FROM deployment WHERE slug = $1 FOR UPDATE")
        .bind(site.slug())
        .execute(&mut *deleting)
        .await
        .unwrap();
    let delete_oldest = delete_version_by_hand(&app, deleting, &oldest, site.slug());
    let (response, ()) = tokio::join!(
        complete(&app, &site, &["index.html", "b.html"]),
        delete_oldest
    );

    assert_eq!(response.status, 200);
    // The two versions left, of two files each
    assert_eq!(response.body["storage_size"], 4);
    assert_eq!(usage(&app, &token).await, 4);
}

/// Deletes a version the way the API does, in a transaction that already holds the
/// site's row, once another request waits for it.
async fn delete_version_by_hand(
    app: &TestApp,
    mut transaction: sqlx::Transaction<'_, sqlx::Postgres>,
    folder: &str,
    slug: &str,
) {
    wait_for_a_lock(app).await;
    let size: i64 = sqlx::query_scalar("DELETE FROM version WHERE folder = $1 RETURNING size")
        .bind(folder)
        .fetch_one(&mut *transaction)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE deployment SET storage_size = storage_size - $1,
         version_count = version_count - 1 WHERE slug = $2",
    )
    .bind(size)
    .bind(slug)
    .execute(&mut *transaction)
    .await
    .unwrap();
    transaction.commit().await.unwrap();
}

/// Waits until a query waits on a row lock, or gives up after a few seconds.
async fn wait_for_a_lock(app: &TestApp) {
    for _ in 0..50 {
        let waiting: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'",
        )
        .fetch_one(&app.db)
        .await
        .unwrap();
        if waiting > 0 {
            return;
        }
        tokio::time::sleep(StdDuration::from_millis(100)).await;
    }
}

#[tokio::test]
async fn cancelling_an_update_deletes_its_files() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;
    let served = site.folder();
    let updated = update(&app, &site, &["index.html", "big.bin"]).await.body;
    upload_all(&app, &updated).await;
    assert_eq!(usage(&app, &token).await, 2);

    assert_eq!(cancel(&app, &site).await.status, 204);
    assert!(app.keys(&folder_of(&updated)).await.is_empty());
    assert!(!app.keys(&served).await.is_empty());
    assert_eq!(
        resolve(&app, site.slug()).await.header("x-site-root"),
        root(&served)
    );
    // Its policies still work, so it counts until they stop
    assert_eq!(usage(&app, &token).await, 2);
}

#[tokio::test]
async fn cancelled_uploads_are_deleted_again_once_their_policies_expire() {
    let mut app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;
    let updated = update(&app, &site, &["index.html", "big.bin"]).await.body;
    assert_eq!(cancel(&app, &site).await.status, 204);
    // The policy still works after the cancel
    assert_eq!(app.upload(&updated, "big.bin", CONTENT).await, 204);

    // Not while files could still be uploaded to it
    app.cleanup().await;
    assert!(!app.keys(&folder_of(&updated)).await.is_empty());

    app.reconfigure(closed_window).await;
    let other = create(&app, &token, &["index.html"]).await;
    app.put_object(&format!("{}index.html", other.folder()), CONTENT)
        .await;
    assert_eq!(cancel(&app, &other).await.status, 204);
    assert_eq!(usage(&app, &token).await, 2);
    app.cleanup().await;
    assert!(app.keys(&other.folder()).await.is_empty());
    assert!(!app.keys(&folder_of(&updated)).await.is_empty());
}

#[tokio::test]
async fn abandoned_updates_are_deleted() {
    let mut app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;
    let served = site.folder();
    // Neither finished nor cancelled, so its window closes on its own
    app.reconfigure(closed_window).await;
    let first = folder_of(&update(&app, &site, &["index.html", "a.bin"]).await.body);
    app.put_object(&format!("{first}a.bin"), CONTENT).await;

    // The next update deletes it
    let second = folder_of(&update(&app, &site, &["index.html", "b.bin"]).await.body);
    app.put_object(&format!("{second}b.bin"), CONTENT).await;
    assert!(app.keys(&first).await.is_empty());

    // And otherwise cleanup does
    app.cleanup().await;
    assert!(app.keys(&second).await.is_empty());
    assert!(!app.keys(&served).await.is_empty());
    assert_eq!(usage(&app, &token).await, 1);
}

#[tokio::test]
async fn list_ready_deployments_for_its_owner() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let first = create(&app, &token, &["index.html"]).await;
    let second = create(&app, &token, &["index.html"]).await;
    let unfinished = create(&app, &token, &["index.html"]).await;
    let other = create(&app, &app.new_token().await, &["index.html"]).await;
    for site in [&first, &second, &other] {
        upload_all(&app, &site.body).await;
        complete(&app, site, &["index.html"]).await;
    }

    let response = app.get(URL, &token).await;
    assert_eq!(response.status, 200);
    let slugs: Vec<_> = response
        .body
        .as_array()
        .unwrap()
        .iter()
        .map(|s| &s["slug"])
        .collect();
    assert_eq!(slugs, [second.slug(), first.slug()]);
    assert!(!response.body.to_string().contains(unfinished.slug()));
}

#[tokio::test]
async fn list_deployments_requires_a_user() {
    let app = TestApp::start().await;
    assert_eq!(app.get(URL, ANONYMOUS).await.status, 401);
    assert_eq!(app.get(URL, "x").await.status, 401);
}

#[tokio::test]
async fn delete_deployment() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;

    assert_eq!(app.delete(&site.url(), &token).await.status, 204);
    assert!(app.keys(&format!("{}/", site.slug())).await.is_empty());
    assert!(versions(&app, site.slug()).await.is_empty());
    assert_eq!(app.get(&site.url(), &token).await.status, 404);
    assert_eq!(resolve(&app, site.slug()).await.status, 403);
}

/// ?slug=...&slug=..., as several sites are changed at once.
fn slugs_query(slugs: &[&str]) -> String {
    let params: Vec<_> = slugs.iter().map(|slug| format!("slug={slug}")).collect();
    format!("{URL}?{}", params.join("&"))
}

#[tokio::test]
async fn delete_several_deployments() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let first = published(&app, &token, &["index.html"]).await;
    let second = published(&app, &token, &["index.html"]).await;
    let kept = published(&app, &token, &["index.html"]).await;

    let url = slugs_query(&[first.slug(), second.slug(), "missing-site-0000"]);
    let response = app.delete(&url, &token).await;
    assert_eq!(response.status, 200);
    let mut deleted = [first.slug(), second.slug()];
    deleted.sort();
    assert_eq!(response.body, json!({"deleted": deleted}));
    for site in [&first, &second] {
        assert!(app.keys(&format!("{}/", site.slug())).await.is_empty());
        assert!(versions(&app, site.slug()).await.is_empty());
    }
    assert!(!app.keys(&format!("{}/", kept.slug())).await.is_empty());
    let listed = app.get(URL, &token).await.body.to_string();
    assert!(!listed.contains(first.slug()) && listed.contains(kept.slug()));

    // Repeating it deletes nothing more
    let response = app.delete(&slugs_query(&[first.slug()]), &token).await;
    assert_eq!(response.body, json!({"deleted": []}));
}

#[tokio::test]
async fn delete_several_requires_owning_them_all() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let mine = published(&app, &token, &["index.html"]).await;
    let theirs = published(&app, &app.new_token().await, &["index.html"]).await;

    let response = app
        .delete(&slugs_query(&[mine.slug(), theirs.slug()]), &token)
        .await;
    assert_eq!(response.status, 403);
    for site in [&mine, &theirs] {
        assert!(!app.keys(&format!("{}/", site.slug())).await.is_empty());
    }
    assert_eq!(app.get(&mine.url(), &token).await.status, 200);
}

#[tokio::test]
async fn delete_several_takes_one_to_a_hundred() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    for count in [0, 101] {
        let slugs: Vec<_> = (0..count).map(|i| format!("site-{i:04x}")).collect();
        let slugs: Vec<_> = slugs.iter().map(String::as_str).collect();
        let url = if count == 0 {
            URL.to_string()
        } else {
            slugs_query(&slugs)
        };
        assert_eq!(app.delete(&url, &token).await.status, 422, "{count}");
    }
}

#[tokio::test]
async fn delete_requires_its_owner() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = create(&app, &token, &["index.html"]).await;

    assert_eq!(app.delete(&site.url(), ANONYMOUS).await.status, 401);
    assert_eq!(
        app.delete(&site.url(), &app.new_token().await).await.status,
        403
    );
    assert_eq!(
        app.delete(&format!("{URL}/missing-slug"), &token)
            .await
            .status,
        404
    );
}

async fn turn(app: &TestApp, site: &Site, enabled: bool) -> Reply {
    app.patch(&site.url(), &site.token, json!({"enabled": enabled}))
        .await
}

#[tokio::test]
async fn turn_sites_off_and_on() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;

    let response = turn(&app, &site, false).await;
    assert_eq!(response.status, 200);
    assert_eq!(response.body["enabled"], false);
    assert_eq!(resolve(&app, site.slug()).await.status, 403);
    let listed = app.get(URL, &token).await.body;
    assert_eq!(listed[0]["enabled"], false);
    assert_eq!(listed.as_array().unwrap().len(), 1);

    assert_eq!(turn(&app, &site, true).await.body["enabled"], true);
    assert_eq!(resolve(&app, site.slug()).await.status, 204);
}

#[tokio::test]
async fn turning_sites_off_requires_their_owner() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = create(&app, &token, &["index.html"]).await;
    let other = Site {
        token: app.new_token().await,
        body: site.body.clone(),
    };

    assert_eq!(turn(&app, &other, false).await.status, 403);
    let response = app
        .patch(&site.url(), ANONYMOUS, json!({"enabled": false}))
        .await;
    assert_eq!(response.status, 401);
}

#[tokio::test]
async fn turn_several_sites_off_and_on() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let first = published(&app, &token, &["index.html"]).await;
    let second = published(&app, &token, &["index.html"]).await;
    let kept = published(&app, &token, &["index.html"]).await;
    let mut slugs = [first.slug(), second.slug()];
    slugs.sort();

    let url = slugs_query(&[first.slug(), second.slug(), "missing-site-0000"]);
    let response = app.patch(&url, &token, json!({"enabled": false})).await;
    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({"changed": slugs}));
    for slug in slugs {
        assert_eq!(resolve(&app, slug).await.status, 403);
    }
    assert_eq!(resolve(&app, kept.slug()).await.status, 204);

    let response = app
        .patch(&slugs_query(&slugs), &token, json!({"enabled": true}))
        .await;
    assert_eq!(response.body, json!({"changed": slugs}));
    for slug in slugs {
        assert_eq!(resolve(&app, slug).await.status, 204);
    }

    // All or nothing when any belongs to someone else
    let theirs = published(&app, &app.new_token().await, &["index.html"]).await;
    let url = slugs_query(&[first.slug(), theirs.slug()]);
    let response = app.patch(&url, &token, json!({"enabled": false})).await;
    assert_eq!(response.status, 403);
    assert_eq!(resolve(&app, first.slug()).await.status, 204);
}

#[tokio::test]
async fn turning_several_sites_needs_a_state() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    for body in [
        json!({}),
        json!({"description": "shared"}),
        json!({"enabled": null}),
    ] {
        let response = app
            .patch(&slugs_query(&["site-0000"]), &token, body.clone())
            .await;
        assert_eq!(response.status, 422, "{body}");
    }
}

#[tokio::test]
async fn updates_keep_sites_off() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;
    turn(&app, &site, false).await;

    let body = update_site(&app, &site, &["index.html", "app.js"]).await;

    assert_eq!(body["enabled"], false);
    assert_eq!(resolve(&app, site.slug()).await.status, 403);
}

async fn describe(app: &TestApp, site: &Site, description: &str) -> Reply {
    app.patch(
        &site.url(),
        &site.token,
        json!({"description": description}),
    )
    .await
}

#[tokio::test]
async fn describe_sites() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let body = with(
        manifest(&["index.html"]),
        json!({"description": "  Portfolio draft  "}),
    );
    let created = app.post(URL, &token, body).await.body;
    assert_eq!(created["description"], "Portfolio draft");
    assert_eq!(
        create(&app, &token, &["index.html"]).await.body["description"],
        ""
    );

    let site = Site {
        token,
        body: created,
    };
    let response = describe(&app, &site, "Portfolio, final").await;
    assert_eq!(response.body["description"], "Portfolio, final");
    assert_eq!(response.body["enabled"], true);
    assert_eq!(describe(&app, &site, "").await.body["description"], "");
}

#[tokio::test]
async fn descriptions_have_a_limit() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let body = with(
        manifest(&["index.html"]),
        json!({"description": "x".repeat(201)}),
    );
    assert_eq!(app.post(URL, &token, body).await.status, 422);
    let site = create(&app, &token, &["index.html"]).await;
    assert_eq!(describe(&app, &site, &"x".repeat(201)).await.status, 422);
    assert_eq!(describe(&app, &site, &"x".repeat(200)).await.status, 200);
}

#[tokio::test]
async fn updates_describe_sites_once_complete() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;
    describe(&app, &site, "First draft").await;
    let url = site.url();
    let body = with(
        manifest(&["index.html"]),
        json!({"description": "Second draft"}),
    );

    app.put(&url, &token, body.clone()).await;
    assert_eq!(
        app.get(&url, &token).await.body["description"],
        "First draft"
    );
    let response = app.post(&format!("{url}/complete"), &token, body).await;
    assert_eq!(response.body["description"], "Second draft");

    // Updates without one keep the description
    update(&app, &site, &["index.html"]).await;
    let response = complete(&app, &site, &["index.html"]).await;
    assert_eq!(response.body["description"], "Second draft");
}

#[tokio::test]
async fn resolve_site_once_ready() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    // Sites without a 404 page are single-page apps
    for (paths, spa) in [
        (["index.html", "app.js"], "1"),
        (["index.html", "404.html"], "0"),
    ] {
        let site = create(&app, &token, &paths).await;
        assert_eq!(site.body["spa"], spa == "1");
        assert_eq!(resolve(&app, site.slug()).await.status, 403);

        upload_all(&app, &site.body).await;
        complete(&app, &site, &paths).await;
        let response = resolve(&app, site.slug()).await;
        assert_eq!(response.status, 204);
        assert_eq!(response.header("x-site-spa"), spa);
    }
}

#[tokio::test]
async fn resolve_unknown_site() {
    let app = TestApp::start().await;
    assert_eq!(resolve(&app, "missing-slug-0000").await.status, 403);
}

#[tokio::test]
async fn sites_expire() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let soon = (Utc::now() + Duration::days(1)).trunc_subsecs(6);
    let body = with(
        manifest(&["index.html"]),
        json!({"expires_at": soon.to_rfc3339()}),
    );
    let site = Site {
        body: app.post(URL, &token, body).await.body,
        token: token.clone(),
    };
    assert_eq!(time(&site.body["expires_at"]), soon);
    upload_all(&app, &site.body).await;
    complete(&app, &site, &["index.html"]).await;
    assert_eq!(resolve(&app, site.slug()).await.status, 204);

    sqlx::query("UPDATE deployment SET expires_at = now() - interval '1 second' WHERE slug = $1")
        .bind(site.slug())
        .execute(&app.db)
        .await
        .unwrap();
    assert_eq!(resolve(&app, site.slug()).await.status, 403);
    // Kept, so it can be put back
    assert_eq!(app.get(&site.url(), &token).await.body["enabled"], true);
    let response = app
        .patch(&site.url(), &token, json!({"expires_at": null}))
        .await;
    assert_eq!(response.body["expires_at"], Value::Null);
    assert_eq!(resolve(&app, site.slug()).await.status, 204);

    // Other changes leave it alone
    app.patch(
        &site.url(),
        &token,
        json!({"expires_at": soon.to_rfc3339()}),
    )
    .await;
    let response = app
        .patch(&site.url(), &token, json!({"enabled": true}))
        .await;
    assert_eq!(time(&response.body["expires_at"]), soon);
}

#[tokio::test]
async fn updates_set_expiries_once_complete() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;
    let url = site.url();
    let soon = (Utc::now() + Duration::days(1)).trunc_subsecs(6);
    let body = with(
        manifest(&["index.html"]),
        json!({"expires_at": soon.to_rfc3339()}),
    );

    app.put(&url, &token, body.clone()).await;
    assert_eq!(app.get(&url, &token).await.body["expires_at"], Value::Null);
    let response = app.post(&format!("{url}/complete"), &token, body).await;
    assert_eq!(time(&response.body["expires_at"]), soon);

    // Updates without one keep the expiry
    update(&app, &site, &["index.html"]).await;
    let response = complete(&app, &site, &["index.html"]).await;
    assert_eq!(time(&response.body["expires_at"]), soon);
}

#[tokio::test]
async fn rejects_past_expiries() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let past = (Utc::now() - Duration::seconds(1)).to_rfc3339();
    let body = with(manifest(&["index.html"]), json!({"expires_at": past}));
    assert_eq!(app.post(URL, &token, body).await.status, 422);
    let site = create(&app, &token, &["index.html"]).await;
    let response = app
        .patch(&site.url(), &token, json!({"expires_at": past}))
        .await;
    assert_eq!(response.status, 422);
}

#[tokio::test]
async fn cleanup_removes_expired_uploads_and_orphans() {
    let mut app = TestApp::start().await;
    let token = app.new_token().await;
    let ready = published(&app, &token, &["index.html"]).await;
    let pending = create(&app, &token, &["index.html"]).await;
    upload_all(&app, &pending.body).await;
    app.reconfigure(closed_window).await;
    let expired = create(&app, &token, &["index.html"]).await;
    app.put_object(&format!("{}index.html", expired.folder()), CONTENT)
        .await;
    app.put_object("orphan-slug-0000/index.html", CONTENT).await;

    let report = app.cleanup().await;

    assert_eq!(report.orphaned, 1);
    assert_eq!(report.expired, 1);
    assert!(app.keys("orphan-slug-0000/").await.is_empty());
    assert!(app.keys(&format!("{}/", expired.slug())).await.is_empty());
    for site in [&ready, &pending] {
        assert!(!app.keys(&format!("{}/", site.slug())).await.is_empty());
    }
    for (site, status) in [(&expired, 404), (&ready, 200), (&pending, 200)] {
        assert_eq!(app.get(&site.url(), &token).await.status, status);
    }
}

#[tokio::test]
async fn cleanup_skips_uploads_still_completing() {
    let app = TestApp::start_with(closed_window).await;
    let token = app.new_token().await;
    let late = create(&app, &token, &["index.html"]).await;

    // A completion that started in time holds the row while it publishes the site
    let mut completing = app.db.begin().await.unwrap();
    sqlx::query("SELECT slug FROM deployment WHERE slug = $1 FOR UPDATE")
        .bind(late.slug())
        .execute(&mut *completing)
        .await
        .unwrap();
    // Waiting on the lock, rather than skipping the row, fails here
    let report = tokio::time::timeout(StdDuration::from_secs(10), app.cleanup())
        .await
        .expect("cleanup waited on a locked row");
    completing.rollback().await.unwrap();

    assert_eq!(report.expired, 0);
    assert_eq!(app.get(&late.url(), &token).await.status, 200);
    // Once it's let go, the next run removes it
    assert_eq!(app.cleanup().await.expired, 1);
    assert_eq!(app.get(&late.url(), &token).await.status, 404);
}

#[tokio::test]
async fn users_have_a_storage_limit() {
    let mut app = TestApp::start_with(|settings| settings.max_account_size = 3).await;
    let token = app.new_token().await;
    published(&app, &token, &["index.html"]).await;
    // Abandoned uploads don't count, even before cleanup removes them
    app.reconfigure(closed_window).await;
    create(&app, &token, &["index.html", "app.js"]).await;
    app.reconfigure(open_window).await;
    // Uploads in progress count
    create(&app, &token, &["index.html"]).await;

    let response = app
        .post(URL, &token, manifest(&["index.html", "app.js"]))
        .await;
    assert_eq!(response.status, 403);
    assert_eq!(
        response.body["detail"],
        "Your sites can use up to 3B in total"
    );
    assert!(create(&app, &token, &["index.html"]).await.body["slug"].is_string());
}

#[tokio::test(flavor = "multi_thread")]
async fn concurrent_uploads_stay_within_the_limit() {
    let app = TestApp::start_with(|settings| settings.max_account_size = 5).await;
    let token = app.new_token().await;

    // Each fits on its own, but only five fit together
    let mut requests = tokio::task::JoinSet::new();
    for _ in 0..12 {
        let request = app
            .http
            .post(format!("{}{URL}", app.url))
            .bearer_auth(&token)
            .json(&manifest(&["index.html"]));
        requests.spawn(async move { request.send().await.unwrap().status().as_u16() });
    }
    let mut statuses = requests.join_all().await;
    statuses.sort();

    assert_eq!(statuses, [[201; 5].as_slice(), &[403; 7]].concat());
    assert_eq!(usage(&app, &token).await, 5);
}

#[tokio::test]
async fn read_usage() {
    let mut app = TestApp::start().await;
    let token = app.new_token().await;
    published(&app, &token, &["index.html"]).await;
    create(&app, &token, &["index.html", "app.js"]).await;
    create(&app, &app.new_token().await, &["index.html"]).await;
    // Abandoned uploads don't count
    app.reconfigure(closed_window).await;
    create(&app, &token, &["index.html"]).await;

    let response = app.get(&format!("{URL}/usage"), &token).await;
    assert_eq!(
        response.body,
        json!({"used": 3, "limit": app.settings().max_account_size})
    );
    assert_eq!(
        app.get(&format!("{URL}/usage"), ANONYMOUS).await.status,
        401
    );
}

#[tokio::test]
async fn updates_count_at_their_new_size() {
    let app = TestApp::start_with(|settings| settings.max_account_size = 3).await;
    let token = app.new_token().await;
    let site = published(&app, &token, &["index.html"]).await;
    published(&app, &token, &["index.html"]).await;

    assert_eq!(
        update(&app, &site, &["index.html", "app.js"]).await.status,
        200
    );
    cancel(&app, &site).await;
    let response = update(&app, &site, &["index.html", "app.js", "404.html"]).await;
    assert_eq!(response.status, 403);
}
