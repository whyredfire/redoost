pub mod auth;
pub mod cleanup;
pub mod config;
pub mod deployments;
pub mod error;
pub mod models;
pub mod oidc;
pub mod setup_bucket;
pub mod sites;
pub mod storage;

use std::sync::Arc;

use anyhow::Result;
use axum::body::Body;
use axum::extract::{DefaultBodyLimit, Request, State};
use axum::http::StatusCode;
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Value, json};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use tokio::sync::OnceCell;

use crate::config::Settings;
use crate::error::ApiError;
use crate::oidc::OidcMetadata;
use crate::storage::Storage;

// Bodies are read before requests are authenticated, so anyone could send a huge one;
// a manifest at the default file limit, with long paths, is a few MiB
pub const MAX_BODY_SIZE: usize = 8 * 1024 * 1024;

/// What every request handler shares.
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub settings: Arc<Settings>,
    pub storage: Storage,
    /// The sign-in provider's configuration, read on first use
    oidc_metadata: Arc<OnceCell<OidcMetadata>>,
}

impl AppState {
    pub fn new(settings: Settings) -> Result<AppState> {
        // Connects on first use, so the API starts while Postgres is still coming up
        let db = PgPoolOptions::new().connect_lazy(&settings.database_url)?;
        Ok(AppState {
            db,
            storage: Storage::new(&settings),
            settings: Arc::new(settings),
            oidc_metadata: Arc::default(),
        })
    }
}

pub fn app(state: AppState) -> Router {
    Router::new()
        .merge(auth::router(&state.settings))
        .merge(deployments::router())
        .merge(sites::router())
        .route("/health", get(health))
        .route("/api/version", get(read_version))
        .fallback(|| async { ApiError::new(StatusCode::NOT_FOUND, "Not Found") })
        .method_not_allowed_fallback(|| async {
            ApiError::new(StatusCode::METHOD_NOT_ALLOWED, "Method Not Allowed")
        })
        .layer(DefaultBodyLimit::disable())
        .layer(middleware::from_fn(limit_body_size))
        .layer(middleware::from_fn(log_request))
        .with_state(state)
}

/// Brings the database schema up to date. Replicas can all run it at once, as each
/// waits for the others' lock.
pub async fn migrate(db: &PgPool) -> Result<()> {
    sqlx::migrate!().run(db).await?;
    Ok(())
}

async fn limit_body_size(request: Request, next: Next) -> Response {
    let (parts, body) = request.into_parts();
    let Ok(body) = axum::body::to_bytes(body, MAX_BODY_SIZE).await else {
        return ApiError::new(StatusCode::PAYLOAD_TOO_LARGE, "Request body is too large")
            .into_response();
    };
    next.run(Request::from_parts(parts, Body::from(body))).await
}

async fn log_request(request: Request, next: Next) -> Response {
    let method = request.method().clone();
    let uri = request.uri().clone();
    let response = next.run(request).await;
    // Health checks come every few seconds and would drown out the rest
    if uri.path() != "/health" {
        tracing::info!("{method} {uri} {}", response.status().as_u16());
    }
    response
}

/// Whether the database and S3 are reachable, and the deployed version, like 0.6.1-3-g1a2b3c4.
async fn health(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    let database = async {
        sqlx::query("SELECT 1")
            .execute(&state.db)
            .await
            .map_err(anyhow::Error::from)
    };
    let (status, health) = match tokio::try_join!(database, state.storage.check()) {
        Ok(_) => (StatusCode::OK, "ok"),
        Err(_) => (StatusCode::SERVICE_UNAVAILABLE, "unavailable"),
    };
    (
        status,
        Json(json!({"status": health, "version": state.settings.version})),
    )
}

// The dashboard's origin only forwards /api, which is where the CLI looks. The CLI now
// updates through npm; cli_sha256 stays null so older Python CLIs refuse to self-update.
async fn read_version(State(state): State<AppState>) -> Json<Value> {
    Json(json!({"version": state.settings.version, "cli_sha256": null}))
}
