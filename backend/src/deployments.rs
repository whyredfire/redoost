use std::collections::BTreeMap;

use axum::body::Bytes;
use axum::extract::{Path, RawQuery, State};
use axum::http::StatusCode;
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use chrono::{DateTime, TimeDelta, Utc};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::PgConnection;
use sqlx::types::Json as JsonColumn;

use crate::AppState;
use crate::auth::Principal;
use crate::config::{Settings, human_readable};
use crate::error::{ApiError, ApiResult, parse_body};
use crate::models::{
    Deployment, DeploymentChange, DeploymentState, Manifest, ManifestFile, Scope, SitesChange,
    StoredObject, User, Version, VersionChange, VersionInfo, is_slug, new_slug, now,
};
use crate::storage::{Storage, UploadPolicy, new_folder, sign_uploads};

// Nginx caches which folder a site serves for a few seconds, and keeps serving it
// while the API is unreachable, so the previous one stays a while before it's deleted
pub const RETIRE_AFTER: TimeDelta = TimeDelta::minutes(2);
// How many addresses are offered at a time
const SLUG_OPTIONS: usize = 4;
// Short enough for a URL, as each one is a query parameter
const MAX_BULK_SITES: usize = 100;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/deployments",
            post(create_deployment)
                .get(list_deployments)
                .patch(change_deployments)
                .delete(delete_deployments),
        )
        .route("/api/deployments/limits", get(read_limits))
        .route("/api/deployments/usage", get(read_usage))
        .route("/api/deployments/slugs", get(suggest_slugs))
        .route(
            "/api/deployments/{slug}",
            get(read_deployment)
                .patch(change_deployment)
                .put(update_deployment)
                .delete(delete_deployment),
        )
        .route("/api/deployments/{slug}/files", get(read_files))
        .route(
            "/api/deployments/{slug}/complete",
            post(complete_deployment),
        )
        .route(
            "/api/deployments/{slug}/versions",
            get(list_versions).delete(prune_versions),
        )
        .route(
            "/api/deployments/{slug}/versions/{version_id}",
            patch(change_version).delete(delete_version),
        )
        .route(
            "/api/deployments/{slug}/versions/{version_id}/restore",
            post(restore_version),
        )
        .route("/api/deployments/{slug}/cancel", post(cancel_upload))
}

pub async fn find_deployment(
    db: &mut PgConnection,
    slug: &str,
) -> sqlx::Result<Option<Deployment>> {
    sqlx::query_as("SELECT * FROM deployment WHERE slug = $1")
        .bind(slug)
        .fetch_optional(db)
        .await
}

async fn owned_deployment(db: &mut PgConnection, slug: &str, user: &User) -> ApiResult<Deployment> {
    let deployment = find_deployment(db, slug)
        .await?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "Deployment not found"))?;
    if deployment.owner_id != user.id {
        return Err(ApiError::new(StatusCode::FORBIDDEN, "Not your deployment"));
    }
    Ok(deployment)
}

/// Reads the site again, holding its row until the transaction ends.
async fn lock_deployment(db: &mut PgConnection, slug: &str) -> sqlx::Result<Deployment> {
    sqlx::query_as("SELECT * FROM deployment WHERE slug = $1 FOR UPDATE")
        .bind(slug)
        .fetch_one(db)
        .await
}

async fn insert_deployment(db: &mut PgConnection, deployment: &Deployment) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO deployment (slug, state, file_count, total_size, storage_size, version_count, spa, enabled,
             description, created_at, expires_at, locked_until, owner_id, folder, pending_folder, pending_size,
             pending_digest)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)",
    )
    .bind(&deployment.slug)
    .bind(deployment.state)
    .bind(deployment.file_count)
    .bind(deployment.total_size)
    .bind(deployment.storage_size)
    .bind(deployment.version_count)
    .bind(deployment.spa)
    .bind(deployment.enabled)
    .bind(&deployment.description)
    .bind(deployment.created_at)
    .bind(deployment.expires_at)
    .bind(deployment.locked_until)
    .bind(&deployment.owner_id)
    .bind(&deployment.folder)
    .bind(&deployment.pending_folder)
    .bind(deployment.pending_size)
    .bind(&deployment.pending_digest)
    .execute(db)
    .await?;
    Ok(())
}

/// Writes every field a handler may have changed.
async fn save_deployment(db: &mut PgConnection, deployment: &Deployment) -> sqlx::Result<()> {
    sqlx::query(
        "UPDATE deployment SET state = $2, file_count = $3, total_size = $4, storage_size = $5, version_count = $6,
             spa = $7, enabled = $8, description = $9, expires_at = $10, locked_until = $11, folder = $12,
             pending_folder = $13, pending_size = $14, pending_digest = $15
         WHERE slug = $1",
    )
    .bind(&deployment.slug)
    .bind(deployment.state)
    .bind(deployment.file_count)
    .bind(deployment.total_size)
    .bind(deployment.storage_size)
    .bind(deployment.version_count)
    .bind(deployment.spa)
    .bind(deployment.enabled)
    .bind(&deployment.description)
    .bind(deployment.expires_at)
    .bind(deployment.locked_until)
    .bind(&deployment.folder)
    .bind(&deployment.pending_folder)
    .bind(deployment.pending_size)
    .bind(&deployment.pending_digest)
    .execute(db)
    .await?;
    Ok(())
}

/// Bytes the user's sites take up. A site being changed counts at the size it's about
/// to take instead, so it's left out.
async fn used_storage(
    db: &mut PgConnection,
    user: &User,
    replacing: Option<&str>,
) -> sqlx::Result<i64> {
    // Every kept version, and the update in progress if any; abandoned uploads don't
    // count, though cleanup hasn't run. Cancelled uploads count until their policies
    // stop working.
    sqlx::query_scalar(
        "SELECT ((
             SELECT coalesce(sum(storage_size + pending_size), 0) FROM deployment
             WHERE owner_id = $1 AND (state = 'ready' OR locked_until > $2) AND slug IS DISTINCT FROM $3
         ) + (
             SELECT coalesce(sum(size), 0) FROM discarded_folder WHERE owner_id = $1 AND delete_after > $2
         ))::bigint",
    )
    .bind(&user.id)
    .bind(now())
    .bind(replacing)
    .fetch_one(db)
    .await
}

async fn check_quota(
    db: &mut PgConnection,
    settings: &Settings,
    user: &User,
    size: i64,
    replacing: Option<&str>,
) -> ApiResult<()> {
    // Other quota checks for the user wait until this transaction ends, or concurrent
    // uploads could all see the same usage and all go ahead. It locks the user's row,
    // so callers commit soon after, and do their slower S3 work beforehand.
    sqlx::query("SELECT id FROM users WHERE id = $1 FOR UPDATE")
        .bind(&user.id)
        .execute(&mut *db)
        .await?;
    let used = used_storage(db, user, replacing).await?;
    if used + size > settings.max_account_size as i64 {
        let limit = human_readable(settings.max_account_size);
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            format!("Your sites can use up to {limit} in total"),
        ));
    }
    Ok(())
}

/// SHA-256 of the files a manifest lists, hashed from the JSON Python's json.dumps
/// wrote, so uploads started before the rewrite still complete.
fn manifest_digest(manifest: &Manifest) -> String {
    let mut files: Vec<&ManifestFile> = manifest.files.iter().collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    let entries: Vec<String> = files
        .iter()
        .map(|file| {
            format!(
                "[{}, {}, {}, {}]",
                python_json(&file.path),
                file.size,
                python_json(&file.sha256),
                file.gzip
            )
        })
        .collect();
    hex::encode(Sha256::digest(format!("[{}]", entries.join(", "))))
}

/// A JSON string with everything but printable ASCII escaped, as Python writes it.
fn python_json(text: &str) -> String {
    let mut escaped = String::from('"');
    for c in text.chars() {
        match c {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            '\u{8}' => escaped.push_str("\\b"),
            '\u{c}' => escaped.push_str("\\f"),
            ' '..='~' => escaped.push(c),
            _ => {
                for unit in c.encode_utf16(&mut [0; 2]) {
                    escaped.push_str(&format!("\\u{unit:04x}"));
                }
            }
        }
    }
    escaped.push('"');
    escaped
}

/// Keeps an unfinished upload's folder counted until its policies stop working.
async fn discard_upload(db: &mut PgConnection, deployment: &Deployment) -> sqlx::Result<()> {
    let Some(folder) = &deployment.pending_folder else {
        return Ok(());
    };
    if Some(folder) == deployment.folder.as_ref() {
        return Ok(());
    }
    let size = match deployment.state {
        DeploymentState::Ready => deployment.pending_size,
        DeploymentState::Uploading => deployment.total_size,
    };
    sqlx::query("INSERT INTO discarded_folder (folder, owner_id, size, delete_after) VALUES ($1, $2, $3, $4)")
        .bind(folder)
        .bind(&deployment.owner_id)
        .bind(size)
        .bind(deployment.locked_until.max(now()))
        .execute(db)
        .await?;
    Ok(())
}

#[derive(Serialize)]
struct DeploymentUploads {
    #[serde(flatten)]
    deployment: Deployment,
    /// URL to POST each file to
    upload_url: String,
    /// Signed upload policy per new or changed file
    uploads: Vec<UploadPolicy>,
}

async fn create_deployment(
    State(state): State<AppState>,
    principal: Principal,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<DeploymentUploads>)> {
    principal.needs(Scope::Publish)?;
    let user = &principal.user;
    let settings = &state.settings;
    let mut manifest: Manifest = parse_body(&body)?;
    if manifest.slug.as_deref().is_some_and(|slug| !is_slug(slug)) {
        return Err(ApiError::invalid(
            json!(["body", "slug"]),
            "String should match pattern '^[a-z]+(-[a-z]+)+-[0-9a-f]{4}$'",
        ));
    }
    manifest.validate(settings)?;

    let mut tx = state.db.begin().await?;
    let now = now();
    if let Some(slug) = &manifest.slug {
        let offered_to: Option<(String, DateTime<Utc>)> =
            sqlx::query_as("DELETE FROM slug_offer WHERE slug = $1 RETURNING user_id, expires_at")
                .bind(slug)
                .fetch_optional(&mut *tx)
                .await?;
        if !offered_to.is_some_and(|(user_id, expires_at)| user_id == user.id && expires_at > now) {
            return Err(ApiError::new(
                StatusCode::CONFLICT,
                "That address is no longer on offer",
            ));
        }
    }
    let slug = manifest.slug.clone().unwrap_or_else(new_slug);
    let total_size = manifest.total_size();
    let deployment = Deployment {
        pending_folder: Some(new_folder(&slug)),
        pending_digest: Some(manifest_digest(&manifest)),
        slug,
        state: DeploymentState::Uploading,
        file_count: manifest.files.len() as i32,
        total_size,
        storage_size: total_size,
        version_count: 0,
        spa: manifest.spa(),
        enabled: true,
        description: manifest.description.clone().unwrap_or_default(),
        created_at: now,
        expires_at: manifest.expires_at,
        locked_until: now + settings.upload_window,
        owner_id: user.id.clone(),
        folder: None,
        pending_size: 0,
    };
    let files: Vec<&ManifestFile> = manifest.files.iter().collect();
    let (upload_url, uploads) = sign_uploads(
        settings,
        deployment.pending_folder.as_deref().unwrap_or_default(),
        &files,
    );
    check_quota(&mut tx, settings, user, total_size, None).await?;
    insert_deployment(&mut tx, &deployment).await?;
    tx.commit().await?;
    Ok((
        StatusCode::CREATED,
        Json(DeploymentUploads {
            deployment,
            upload_url,
            uploads,
        }),
    ))
}

async fn list_deployments(
    State(state): State<AppState>,
    principal: Principal,
) -> ApiResult<Json<Vec<Deployment>>> {
    let deployments = sqlx::query_as(
        "SELECT * FROM deployment WHERE owner_id = $1 AND state = 'ready' ORDER BY created_at DESC",
    )
    .bind(&principal.user.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(deployments))
}

// Lets the frontend reject oversized sites before hashing them
async fn read_limits(State(state): State<AppState>) -> Json<Value> {
    let settings = &state.settings;
    Json(json!({
        "max_file_size": settings.max_file_size,
        "max_deployment_size": settings.max_deployment_size,
        "max_deployment_files": settings.max_deployment_files,
    }))
}

async fn read_usage(State(state): State<AppState>, principal: Principal) -> ApiResult<Json<Value>> {
    let used = used_storage(&mut *state.db.acquire().await?, &principal.user, None).await?;
    Ok(Json(
        json!({"used": used, "limit": state.settings.max_account_size}),
    ))
}

// Unused addresses to publish a new site at, held for the user as long as an upload
// window, so only what was offered can be picked
async fn suggest_slugs(
    State(state): State<AppState>,
    principal: Principal,
) -> ApiResult<Json<Vec<String>>> {
    principal.needs(Scope::Publish)?;
    let expires_at = now() + state.settings.upload_window;
    let slugs: Vec<String> = (0..SLUG_OPTIONS).map(|_| new_slug()).collect();
    sqlx::query(
        "INSERT INTO slug_offer (slug, user_id, expires_at) SELECT unnest($1::varchar[]), $2, $3",
    )
    .bind(&slugs)
    .bind(&principal.user.id)
    .bind(expires_at)
    .execute(&state.db)
    .await?;
    Ok(Json(slugs))
}

async fn read_deployment(
    State(state): State<AppState>,
    principal: Principal,
    Path(slug): Path<String>,
) -> ApiResult<Json<Deployment>> {
    let deployment =
        owned_deployment(&mut *state.db.acquire().await?, &slug, &principal.user).await?;
    Ok(Json(deployment))
}

async fn change_deployment(
    State(state): State<AppState>,
    principal: Principal,
    Path(slug): Path<String>,
    body: Bytes,
) -> ApiResult<Json<Deployment>> {
    principal.needs(Scope::Manage)?;
    let mut db = state.db.acquire().await?;
    let mut deployment = owned_deployment(&mut db, &slug, &principal.user).await?;
    let mut change: DeploymentChange = parse_body(&body)?;
    change.validate()?;
    if let Some(enabled) = change.enabled {
        deployment.enabled = enabled;
    }
    if let Some(description) = change.description {
        deployment.description = description;
    }
    // Null clears it, unlike the others, so only a missing one is left alone
    if let Some(expires_at) = change.expires_at {
        deployment.expires_at = expires_at;
    }
    save_deployment(&mut db, &deployment).await?;
    Ok(Json(deployment))
}

fn matches(stored: Option<&StoredObject>, file: &ManifestFile) -> bool {
    let Some(stored) = stored else { return false };
    // Clients compress the same file to different bytes
    if let (Some(stored_original), Some(original)) =
        (&stored.original_sha256, &file.original_sha256)
    {
        return stored_original == original;
    }
    stored.sha256.as_ref() == Some(&file.sha256) && stored.size == file.size
}

/// A published version's files, by path.
async fn served_files(
    db: &mut PgConnection,
    folder: &str,
) -> sqlx::Result<BTreeMap<String, StoredObject>> {
    // Only versions an older release published mid-rollout lack them; updating
    // one uploads every file again
    Ok(find_version(db, folder)
        .await?
        .map(|version| version.files.0)
        .unwrap_or_default())
}

async fn find_version(db: &mut PgConnection, folder: &str) -> sqlx::Result<Option<Version>> {
    sqlx::query_as("SELECT * FROM version WHERE folder = $1")
        .bind(folder)
        .fetch_optional(db)
        .await
}

async fn set_retired_at(
    db: &mut PgConnection,
    folder: &str,
    retired_at: Option<DateTime<Utc>>,
) -> sqlx::Result<()> {
    sqlx::query("UPDATE version SET retired_at = $2 WHERE folder = $1")
        .bind(folder)
        .bind(retired_at)
        .execute(db)
        .await?;
    Ok(())
}

/// Deletes a version, waiting out Nginx's cache if it was served just now.
async fn discard_version(
    db: &mut PgConnection,
    storage: &Storage,
    deployment: &mut Deployment,
    version: &Version,
    now: DateTime<Utc>,
) -> anyhow::Result<()> {
    match version.retired_at {
        Some(retired_at) if retired_at > now - RETIRE_AFTER => {
            sqlx::query("INSERT INTO discarded_folder (folder, owner_id, size, delete_after) VALUES ($1, $2, 0, $3)")
                .bind(&version.folder)
                .bind(&deployment.owner_id)
                .bind(retired_at + RETIRE_AFTER)
                .execute(&mut *db)
                .await?;
        }
        _ => storage.delete_folder(&version.folder).await?,
    }
    sqlx::query("DELETE FROM version WHERE folder = $1")
        .bind(&version.folder)
        .execute(db)
        .await?;
    deployment.storage_size -= version.size;
    deployment.version_count -= 1;
    Ok(())
}

/// The site's versions, newest first.
async fn site_versions(db: &mut PgConnection, slug: &str) -> sqlx::Result<Vec<Version>> {
    sqlx::query_as("SELECT * FROM version WHERE slug = $1 ORDER BY created_at DESC")
        .bind(slug)
        .fetch_all(db)
        .await
}

/// Drops the oldest versions beyond what each site keeps.
async fn trim_versions(
    db: &mut PgConnection,
    state: &AppState,
    deployment: &mut Deployment,
    now: DateTime<Utc>,
) -> anyhow::Result<()> {
    let versions = site_versions(db, &deployment.slug).await?;
    for version in versions.iter().skip(state.settings.kept_versions) {
        if Some(&version.folder) != deployment.folder.as_ref() {
            discard_version(db, &state.storage, deployment, version, now).await?;
        }
    }
    Ok(())
}

#[derive(Serialize)]
struct StoredFile {
    path: String,
    /// Base64-encoded SHA-256 of the stored bytes
    sha256: Option<String>,
    /// Base64-encoded SHA-256 before compression, if its client sent one
    original_sha256: Option<String>,
}

// Lets the frontend show what an update changes before it starts
async fn read_files(
    State(state): State<AppState>,
    principal: Principal,
    Path(slug): Path<String>,
) -> ApiResult<Json<Vec<StoredFile>>> {
    let mut db = state.db.acquire().await?;
    let deployment = owned_deployment(&mut db, &slug, &principal.user).await?;
    let Some(folder) = &deployment.folder else {
        return Ok(Json(Vec::new()));
    };
    let files = served_files(&mut db, folder)
        .await?
        .into_iter()
        .map(|(path, stored)| StoredFile {
            path,
            sha256: stored.sha256,
            original_sha256: stored.original_sha256,
        })
        .collect();
    Ok(Json(files))
}

async fn update_deployment(
    State(state): State<AppState>,
    principal: Principal,
    Path(slug): Path<String>,
    body: Bytes,
) -> ApiResult<Json<DeploymentUploads>> {
    principal.needs(Scope::Publish)?;
    let settings = &state.settings;
    let mut tx = state.db.begin().await?;
    let deployment = owned_deployment(&mut tx, &slug, &principal.user).await?;
    let mut manifest: Manifest = parse_body(&body)?;
    manifest.validate(settings)?;
    let (DeploymentState::Ready, Some(served_folder)) = (deployment.state, &deployment.folder)
    else {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "Site isn't published yet",
        ));
    };
    let now = now();

    // Only new and changed files are uploaded; the rest are copied when it completes
    let served = served_files(&mut tx, served_folder).await?;
    let changed: Vec<&ManifestFile> = manifest
        .files
        .iter()
        .filter(|file| !matches(served.get(&file.path), file))
        .collect();
    let pending_size = changed.iter().map(|file| file.size).sum();
    let folder = new_folder(&deployment.slug);
    let (upload_url, uploads) = sign_uploads(settings, &folder, &changed);
    // The kept versions stay stored while the update is in progress
    check_quota(
        &mut tx,
        settings,
        &principal.user,
        deployment.storage_size + pending_size,
        Some(&slug),
    )
    .await?;

    // Locked, so two uploads to a site never overlap
    let mut deployment = lock_deployment(&mut tx, &slug).await?;
    if deployment.locked_until > now {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "Another upload to this site is in progress",
        ));
    }
    // An earlier update nobody finished or cancelled, whose window has closed
    let abandoned = deployment.pending_folder.take();
    deployment.locked_until = now + settings.upload_window;
    deployment.pending_folder = Some(folder);
    deployment.pending_size = pending_size;
    deployment.pending_digest = Some(manifest_digest(&manifest));
    save_deployment(&mut tx, &deployment).await?;
    tx.commit().await?;

    if let Some(abandoned) =
        abandoned.filter(|abandoned| Some(abandoned) != deployment.folder.as_ref())
    {
        state.storage.delete_folder(&abandoned).await?;
    }
    Ok(Json(DeploymentUploads {
        deployment,
        upload_url,
        uploads,
    }))
}

async fn complete_deployment(
    State(state): State<AppState>,
    principal: Principal,
    Path(slug): Path<String>,
    body: Bytes,
) -> ApiResult<Json<Deployment>> {
    principal.needs(Scope::Publish)?;
    let settings = &state.settings;
    let mut tx = state.db.begin().await?;
    let deployment = owned_deployment(&mut tx, &slug, &principal.user).await?;
    let mut manifest: Manifest = parse_body(&body)?;
    manifest.validate(settings)?;
    let now = now();
    let folder = match &deployment.pending_folder {
        Some(folder) if deployment.locked_until > now => folder.clone(),
        _ => {
            // Repeats a completion whose response was lost
            if let (DeploymentState::Ready, Some(served_folder)) =
                (deployment.state, &deployment.folder)
            {
                let served = served_files(&mut tx, served_folder).await?;
                if served.len() == manifest.files.len()
                    && manifest
                        .files
                        .iter()
                        .all(|file| matches(served.get(&file.path), file))
                {
                    return Ok(Json(deployment));
                }
            }
            return Err(ApiError::new(StatusCode::GONE, "Upload window has closed"));
        }
    };
    // So leftover policies can only rewrite the files it publishes, with the same bytes
    if deployment.pending_digest.as_deref() != Some(manifest_digest(&manifest).as_str()) {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "These aren't the files this upload started with",
        ));
    }

    let uploaded = state.storage.read_objects(&folder).await?;
    let served = match &deployment.folder {
        Some(served_folder) if *served_folder != folder => {
            served_files(&mut tx, served_folder).await?
        }
        _ => BTreeMap::new(),
    };
    // Files the update didn't change come from the version being served
    let copied: Vec<String> = manifest
        .files
        .iter()
        .filter(|file| {
            !matches(uploaded.get(&file.path), file) && matches(served.get(&file.path), file)
        })
        .map(|file| file.path.clone())
        .collect();
    let found = copied.len()
        + manifest
            .files
            .iter()
            .filter(|file| matches(uploaded.get(&file.path), file))
            .count();
    if found != manifest.files.len() {
        let message = format!("{found} of {} files uploaded", manifest.files.len());
        return Err(ApiError::new(StatusCode::CONFLICT, message));
    }

    // Counted from storage, as the manifest's sizes are only the client's word
    let mut stored = served;
    stored.extend(uploaded.clone());
    let total_size: i64 = manifest
        .files
        .iter()
        .map(|file| stored[&file.path].size)
        .sum();

    let extra: Vec<String> = uploaded
        .keys()
        .filter(|path| !manifest.files.iter().any(|file| &file.path == *path))
        .cloned()
        .collect();
    state.storage.delete_paths(&folder, &extra).await?;
    if let Some(served_folder) = &deployment.folder
        && !copied.is_empty()
    {
        state
            .storage
            .copy_files(served_folder, &folder, &copied)
            .await?;
    }

    // Checked again, as other uploads may have finished since this one started
    let storage_size = |deployment: &Deployment| match &deployment.folder {
        Some(replaced) if *replaced != folder => deployment.storage_size + total_size,
        _ => total_size,
    };
    check_quota(
        &mut tx,
        settings,
        &principal.user,
        storage_size(&deployment),
        Some(&slug),
    )
    .await?;
    // The window may have closed while files were copied, letting cleanup or a new
    // update take the folder; locked, so neither can until this commits
    let mut deployment = lock_deployment(&mut tx, &slug).await?;
    if deployment.pending_folder.as_ref() != Some(&folder) {
        // A repeated request finished it first
        if deployment.folder.as_ref() == Some(&folder) {
            return Ok(Json(deployment));
        }
        return Err(ApiError::new(StatusCode::GONE, "Upload window has closed"));
    }
    // Counted again from the locked row, as versions deleted meanwhile changed it;
    // that only makes it smaller than what the quota was checked against
    deployment.storage_size = storage_size(&deployment);
    let files: BTreeMap<String, StoredObject> = manifest
        .files
        .iter()
        .map(|file| {
            let stored = &stored[&file.path];
            let original_sha256 = file
                .original_sha256
                .clone()
                .or_else(|| stored.original_sha256.clone());
            let recorded = StoredObject {
                sha256: stored.sha256.clone(),
                size: stored.size,
                original_sha256,
            };
            (file.path.clone(), recorded)
        })
        .collect();
    sqlx::query(
        "INSERT INTO version (folder, slug, created_at, retired_at, file_count, size, spa, description, files)
         VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8)",
    )
    .bind(&folder)
    .bind(&slug)
    .bind(now)
    .bind(manifest.files.len() as i32)
    .bind(total_size)
    .bind(manifest.spa())
    .bind(manifest.version_description.clone().unwrap_or_default())
    .bind(JsonColumn(files))
    .execute(&mut *tx)
    .await?;
    if let Some(replaced) = deployment
        .folder
        .as_ref()
        .filter(|replaced| **replaced != folder)
    {
        set_retired_at(&mut tx, replaced, Some(now)).await?;
    }
    deployment.version_count += 1;

    // Visitors switch to the new files all at once
    deployment.folder = Some(folder);
    deployment.pending_folder = None;
    deployment.pending_size = 0;
    deployment.pending_digest = None;
    deployment.state = DeploymentState::Ready;
    deployment.file_count = manifest.files.len() as i32;
    deployment.total_size = total_size;
    deployment.spa = manifest.spa();
    // Set here rather than when the update starts, so a failed update keeps the old one
    if let Some(description) = manifest.description {
        deployment.description = description;
    }
    if manifest.expires_at.is_some() {
        deployment.expires_at = manifest.expires_at;
    }
    // Frees the site for its next update
    deployment.locked_until = now;
    trim_versions(&mut tx, &state, &mut deployment, now).await?;
    save_deployment(&mut tx, &deployment).await?;
    tx.commit().await?;
    Ok(Json(deployment))
}

async fn get_version(
    db: &mut PgConnection,
    deployment: &Deployment,
    version_id: &str,
) -> ApiResult<Version> {
    let folder = format!("{}/{version_id}/", deployment.slug);
    find_version(db, &folder)
        .await?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "Version not found"))
}

async fn list_versions(
    State(state): State<AppState>,
    principal: Principal,
    Path(slug): Path<String>,
) -> ApiResult<Json<Vec<VersionInfo>>> {
    let mut db = state.db.acquire().await?;
    let deployment = owned_deployment(&mut db, &slug, &principal.user).await?;
    let versions = site_versions(&mut db, &slug).await?;
    Ok(Json(
        versions
            .iter()
            .map(|version| VersionInfo::new(version, &deployment))
            .collect(),
    ))
}

async fn change_version(
    State(state): State<AppState>,
    principal: Principal,
    Path((slug, version_id)): Path<(String, String)>,
    body: Bytes,
) -> ApiResult<Json<VersionInfo>> {
    principal.needs(Scope::Manage)?;
    let mut db = state.db.acquire().await?;
    let deployment = owned_deployment(&mut db, &slug, &principal.user).await?;
    let mut change: VersionChange = parse_body(&body)?;
    change.validate()?;
    let mut version = get_version(&mut db, &deployment, &version_id).await?;
    version.description = change.description;
    sqlx::query("UPDATE version SET description = $2 WHERE folder = $1")
        .bind(&version.folder)
        .bind(&version.description)
        .execute(&mut *db)
        .await?;
    Ok(Json(VersionInfo::new(&version, &deployment)))
}

// Points the site back at a kept version; nothing is uploaded or copied
async fn restore_version(
    State(state): State<AppState>,
    principal: Principal,
    Path((slug, version_id)): Path<(String, String)>,
) -> ApiResult<Json<Deployment>> {
    principal.needs(Scope::Publish)?;
    let mut tx = state.db.begin().await?;
    owned_deployment(&mut tx, &slug, &principal.user).await?;
    let now = now();
    // Locked, as an update completing meanwhile would switch folders too, and the
    // version is read after, so one deleted meanwhile isn't served
    let mut deployment = lock_deployment(&mut tx, &slug).await?;
    let version = get_version(&mut tx, &deployment, &version_id).await?;
    if deployment.locked_until > now {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "Another upload to this site is in progress",
        ));
    }
    if Some(&version.folder) == deployment.folder.as_ref() {
        return Ok(Json(deployment));
    }
    if let Some(current) = &deployment.folder {
        set_retired_at(&mut tx, current, Some(now)).await?;
    }
    set_retired_at(&mut tx, &version.folder, None).await?;
    deployment.folder = Some(version.folder);
    deployment.file_count = version.file_count;
    deployment.total_size = version.size;
    deployment.spa = version.spa;
    save_deployment(&mut tx, &deployment).await?;
    tx.commit().await?;
    Ok(Json(deployment))
}

async fn delete_version(
    State(state): State<AppState>,
    principal: Principal,
    Path((slug, version_id)): Path<(String, String)>,
) -> ApiResult<StatusCode> {
    principal.needs(Scope::Manage)?;
    let mut tx = state.db.begin().await?;
    owned_deployment(&mut tx, &slug, &principal.user).await?;
    // Locked, as a restore or an update completing meanwhile changes what's served,
    // and both write the storage size this changes
    let mut deployment = lock_deployment(&mut tx, &slug).await?;
    let version = get_version(&mut tx, &deployment, &version_id).await?;
    if Some(&version.folder) == deployment.folder.as_ref() {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "The version being served can't be deleted",
        ));
    }
    discard_version(&mut tx, &state.storage, &mut deployment, &version, now()).await?;
    save_deployment(&mut tx, &deployment).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

// Keeps only the version being served
async fn prune_versions(
    State(state): State<AppState>,
    principal: Principal,
    Path(slug): Path<String>,
) -> ApiResult<Json<Deployment>> {
    principal.needs(Scope::Manage)?;
    let mut tx = state.db.begin().await?;
    owned_deployment(&mut tx, &slug, &principal.user).await?;
    let now = now();
    // Locked, like deleting one version
    let mut deployment = lock_deployment(&mut tx, &slug).await?;
    for version in site_versions(&mut tx, &slug).await? {
        if Some(&version.folder) != deployment.folder.as_ref() {
            discard_version(&mut tx, &state.storage, &mut deployment, &version, now).await?;
        }
    }
    save_deployment(&mut tx, &deployment).await?;
    tx.commit().await?;
    Ok(Json(deployment))
}

// Frees the site for another update, deleting what it uploaded so far
async fn cancel_upload(
    State(state): State<AppState>,
    principal: Principal,
    Path(slug): Path<String>,
) -> ApiResult<StatusCode> {
    principal.needs(Scope::Publish)?;
    let mut tx = state.db.begin().await?;
    let mut deployment = owned_deployment(&mut tx, &slug, &principal.user).await?;
    if let Some(pending_folder) = &deployment.pending_folder
        && Some(pending_folder) != deployment.folder.as_ref()
    {
        state.storage.delete_folder(pending_folder).await?;
    }
    // Its policies still work, so anything uploaded with them is deleted later
    discard_upload(&mut tx, &deployment).await?;
    deployment.pending_folder = None;
    deployment.pending_size = 0;
    deployment.pending_digest = None;
    deployment.locked_until = now();
    save_deployment(&mut tx, &deployment).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Deletes sites and their files; the caller commits.
async fn remove_sites(
    db: &mut PgConnection,
    storage: &Storage,
    deployments: &[Deployment],
) -> anyhow::Result<()> {
    let slugs: Vec<String> = deployments
        .iter()
        .map(|deployment| deployment.slug.clone())
        .collect();
    // Files go first, so a failed delete leaves the deployments in place to retry
    storage.delete_sites(&slugs).await?;
    for deployment in deployments {
        discard_upload(db, deployment).await?;
        sqlx::query("DELETE FROM deployment WHERE slug = $1")
            .bind(&deployment.slug)
            .execute(&mut *db)
            .await?;
    }
    Ok(())
}

/// The slugs of ?slug=...&slug=..., several sites to change at once.
fn bulk_slugs(query: Option<&str>) -> ApiResult<Vec<String>> {
    let slugs: Vec<String> = form_urlencoded::parse(query.unwrap_or_default().as_bytes())
        .filter(|(name, _)| name == "slug")
        .map(|(_, slug)| slug.into_owned())
        .collect();
    if slugs.is_empty() {
        return Err(ApiError::invalid(
            json!(["query", "slug"]),
            "Field required",
        ));
    }
    if slugs.len() > MAX_BULK_SITES {
        let message = format!(
            "List should have at most {MAX_BULK_SITES} items after validation, not {}",
            slugs.len()
        );
        return Err(ApiError::invalid(json!(["query", "slug"]), message));
    }
    Ok(slugs)
}

/// The sites among slugs, all the user's; ones that don't exist are skipped.
async fn owned_sites(
    db: &mut PgConnection,
    user: &User,
    slugs: &[String],
) -> ApiResult<Vec<Deployment>> {
    let deployments: Vec<Deployment> =
        sqlx::query_as("SELECT * FROM deployment WHERE slug = ANY($1) ORDER BY slug")
            .bind(slugs)
            .fetch_all(db)
            .await?;
    if deployments
        .iter()
        .any(|deployment| deployment.owner_id != user.id)
    {
        return Err(ApiError::new(StatusCode::FORBIDDEN, "Not your deployment"));
    }
    Ok(deployments)
}

// Repeating it changes nothing more, as with deleting several
async fn change_deployments(
    State(state): State<AppState>,
    principal: Principal,
    RawQuery(query): RawQuery,
    body: Bytes,
) -> ApiResult<Json<Value>> {
    principal.needs(Scope::Manage)?;
    let slugs = bulk_slugs(query.as_deref())?;
    let change: SitesChange = parse_body(&body)?;
    let mut tx = state.db.begin().await?;
    let found: Vec<String> = owned_sites(&mut tx, &principal.user, &slugs)
        .await?
        .into_iter()
        .map(|deployment| deployment.slug)
        .collect();
    sqlx::query("UPDATE deployment SET enabled = $2 WHERE slug = ANY($1)")
        .bind(&found)
        .bind(change.enabled)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({"changed": found})))
}

// Sites that don't exist are skipped, so a repeated request deletes nothing twice
async fn delete_deployments(
    State(state): State<AppState>,
    principal: Principal,
    RawQuery(query): RawQuery,
) -> ApiResult<Json<Value>> {
    principal.needs(Scope::Manage)?;
    let slugs = bulk_slugs(query.as_deref())?;
    let mut tx = state.db.begin().await?;
    let deployments = owned_sites(&mut tx, &principal.user, &slugs).await?;
    remove_sites(&mut tx, &state.storage, &deployments).await?;
    tx.commit().await?;
    let deleted: Vec<String> = deployments
        .into_iter()
        .map(|deployment| deployment.slug)
        .collect();
    Ok(Json(json!({"deleted": deleted})))
}

async fn delete_deployment(
    State(state): State<AppState>,
    principal: Principal,
    Path(slug): Path<String>,
) -> ApiResult<StatusCode> {
    principal.needs(Scope::Manage)?;
    let mut tx = state.db.begin().await?;
    let deployment = owned_deployment(&mut tx, &slug, &principal.user).await?;
    remove_sites(&mut tx, &state.storage, &[deployment]).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_json_like_python() {
        assert_eq!(
            python_json("docs/café \"menu\".txt"),
            r#""docs/caf\u00e9 \"menu\".txt""#
        );
        assert_eq!(python_json("🦀"), r#""\ud83e\udd80""#);
    }
}
