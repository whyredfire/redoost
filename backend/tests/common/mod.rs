//! Shared setup for the API's integration tests.
//!
//! Like the Python tests before them, these run against a real Postgres database and a
//! real Garage bucket, and empty both before every test. Tests wait their turn on one
//! lock, as they share both, so plain `cargo test` works. To run them locally:
//!
//! ```sh
//! docker run -d --name rs-tests-pg -p 55420:5432 -e POSTGRES_USER=redoost \
//!   -e POSTGRES_PASSWORD=redoost -e POSTGRES_DB=redoost_test postgres:18-alpine
//! docker run -d --name rs-tests-garage -p 55480:3900 \
//!   -v "$PWD/../garage.toml:/etc/garage.toml:ro" \
//!   -e GARAGE_RPC_SECRET=$(openssl rand -hex 32) \
//!   -e GARAGE_DEFAULT_ACCESS_KEY=GK000000000000000000000001 \
//!   -e GARAGE_DEFAULT_SECRET_KEY=0000000000000000000000000000000000000000000000000000000000000001 \
//!   -e GARAGE_DEFAULT_BUCKET=redoost-sites \
//!   dxflrs/garage:v2.5.0 /garage server --single-node --default-bucket
//!
//! REDOOST_TEST_DATABASE_URL=postgres://redoost:redoost@127.0.0.1:55420/redoost_test \
//! REDOOST_S3_ENDPOINT=http://127.0.0.1:55480 \
//! REDOOST_S3_PUBLIC_ENDPOINT=http://127.0.0.1:55480 \
//! REDOOST_S3_ACCESS_KEY_ID=GK000000000000000000000001 \
//! REDOOST_S3_SECRET_ACCESS_KEY=0000000000000000000000000000000000000000000000000000000000000001 \
//! cargo test
//! ```
//!
//! In the compose stack, `docker compose exec -e REDOOST_S3_PUBLIC_ENDPOINT=http://garage:3900 api cargo test`
//! uses its Postgres and Garage; uploads go straight to Garage rather than through the gateway.
#![allow(dead_code)]

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::types::{ChecksumAlgorithm, ChecksumMode, Delete, ObjectIdentifier};
use axum::extract::{Form, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::Engine;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use redoost_api::AppState;
use redoost_api::config::Settings;
use redoost_api::storage::Storage;
use reqwest::Method;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use tokio::sync::MutexGuard;

/// Sends no Authorization header.
pub const ANONYMOUS: &str = "";
/// Nothing listens here, so requests to it fail at once.
pub fn unreachable() -> url::Url {
    "http://127.0.0.1:9/".parse().unwrap()
}

// Tests share one database and bucket, so they take turns
static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Waits for the other tests to finish, then sets the environment up like the
/// Python tests' conftest did.
pub async fn serial() -> MutexGuard<'static, ()> {
    let guard = SERIAL.lock().await;
    let Ok(database_url) = std::env::var("REDOOST_TEST_DATABASE_URL") else {
        panic!("Set REDOOST_TEST_DATABASE_URL to a Postgres database for tests");
    };
    // Tests never touch the real database, and empty the one they're given
    set_env("REDOOST_DATABASE_URL", &database_url);
    // Real values from the environment take precedence, which points tests at Garage
    for (name, value) in [
        ("REDOOST_LOG_LEVEL", "INFO"),
        ("REDOOST_APP_ORIGIN", "http://localhost:5173"),
        ("REDOOST_S3_ENDPOINT", "http://127.0.0.1:3900"),
        ("REDOOST_S3_PUBLIC_ENDPOINT", "http://127.0.0.1:3900"),
        ("REDOOST_S3_REGION", "garage"),
        ("REDOOST_S3_BUCKET", "redoost-sites"),
        ("REDOOST_S3_ACCESS_KEY_ID", "test-key"),
        ("REDOOST_S3_SECRET_ACCESS_KEY", "test-secret"),
        ("REDOOST_JWT_SECRET", "test-jwt-secret-that-is-long-enough"),
    ] {
        if std::env::var_os(name).is_none() {
            set_env(name, value);
        }
    }
    // Tests use dev sign-in, and report a development build
    for name in [
        "REDOOST_OIDC_ISSUER",
        "REDOOST_VERSION",
        "REDOOST_UPLOAD_WINDOW",
        "REDOOST_MAX_ACCOUNT_SIZE",
        "REDOOST_KEPT_VERSIONS",
    ] {
        remove_env(name);
    }
    set_env("REDOOST_DEV_SIGN_IN", "true");
    guard
}

pub fn set_env(name: &str, value: &str) {
    // SAFETY: tests only change the environment while holding the serial lock
    unsafe { std::env::set_var(name, value) }
}

pub fn remove_env(name: &str) {
    // SAFETY: as in set_env
    unsafe { std::env::remove_var(name) }
}

/// Connects to the test database and drops everything in it.
pub async fn empty_database(settings: &Settings) -> PgPool {
    let db = PgPool::connect(&settings.database_url)
        .await
        .expect("Postgres isn't reachable at REDOOST_TEST_DATABASE_URL");
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
        .execute(&db)
        .await
        .unwrap();
    db
}

/// The API, running on a port of its own, with an empty database and bucket.
pub struct TestApp {
    /// Where the API listens, like http://127.0.0.1:52345
    pub url: String,
    pub state: AppState,
    /// For reading and changing rows the API doesn't expose
    pub db: PgPool,
    /// For reading and changing what Garage stores
    pub s3: aws_sdk_s3::Client,
    pub http: reqwest::Client,
    _serial: MutexGuard<'static, ()>,
}

/// An API response, with its body parsed as JSON when it is JSON.
#[derive(Debug)]
pub struct Reply {
    pub status: u16,
    pub headers: HeaderMap,
    pub body: Value,
}

impl Reply {
    pub fn header(&self, name: &str) -> &str {
        self.headers[name].to_str().unwrap()
    }
}

impl TestApp {
    pub async fn start() -> TestApp {
        TestApp::start_with(|_| {}).await
    }

    /// Starts the API with changed settings.
    pub async fn start_with(change: impl FnOnce(&mut Settings)) -> TestApp {
        let serial = serial().await;
        let mut settings = Settings::from_env().unwrap();
        // Emptied as the environment says, as a test may point the API elsewhere
        let s3 = Storage::new(&settings).client;
        empty_bucket(&s3, &settings.s3_bucket).await;
        change(&mut settings);
        let db = empty_database(&settings).await;
        redoost_api::migrate(&db).await.unwrap();
        let state = AppState::new(settings).unwrap();
        let url = serve(state.clone()).await;
        TestApp {
            url,
            state,
            db,
            s3,
            http: reqwest::Client::new(),
            _serial: serial,
        }
    }

    /// Restarts the API with changed settings, keeping its database and bucket, like
    /// the Python tests patching settings halfway through.
    pub async fn reconfigure(&mut self, change: impl FnOnce(&mut Settings)) {
        let mut settings = (*self.state.settings).clone();
        change(&mut settings);
        self.state = AppState::new(settings).unwrap();
        self.url = serve(self.state.clone()).await;
    }

    pub fn settings(&self) -> &Settings {
        &self.state.settings
    }

    /// Sends a request, with a bearer token unless it's ANONYMOUS, and a JSON body
    /// unless it's null.
    pub async fn request(&self, method: Method, path: &str, token: &str, body: Value) -> Reply {
        let mut request = self.http.request(method, format!("{}{path}", self.url));
        if !token.is_empty() {
            request = request.bearer_auth(token);
        }
        if !body.is_null() {
            request = request.json(&body);
        }
        reply(request.send().await.unwrap()).await
    }

    pub async fn get(&self, path: &str, token: &str) -> Reply {
        self.request(Method::GET, path, token, Value::Null).await
    }

    pub async fn post(&self, path: &str, token: &str, body: Value) -> Reply {
        self.request(Method::POST, path, token, body).await
    }

    pub async fn put(&self, path: &str, token: &str, body: Value) -> Reply {
        self.request(Method::PUT, path, token, body).await
    }

    pub async fn patch(&self, path: &str, token: &str, body: Value) -> Reply {
        self.request(Method::PATCH, path, token, body).await
    }

    pub async fn delete(&self, path: &str, token: &str) -> Reply {
        self.request(Method::DELETE, path, token, Value::Null).await
    }

    /// Creates a user and returns a dashboard token for it.
    pub async fn new_token(&self) -> String {
        let id = unique_hex();
        sqlx::query(
            "INSERT INTO users (id, provider, subject, created_at) VALUES ($1, 'google', $1, now())",
        )
        .bind(&id)
        .execute(&self.db)
        .await
        .unwrap();
        redoost_api::auth::create_token(self.settings(), &id)
    }

    pub async fn cleanup(&self) -> redoost_api::cleanup::Report {
        redoost_api::cleanup::run(&self.state).await.unwrap()
    }

    /// Uploads a file with the signed policy a deployment's response holds for it.
    pub async fn upload(&self, deployment: &Value, path: &str, content: &[u8]) -> u16 {
        self.upload_with(deployment, path, content, &[]).await
    }

    /// Uploads a file, with some of its policy's form fields changed.
    pub async fn upload_with(
        &self,
        deployment: &Value,
        path: &str,
        content: &[u8],
        changes: &[(&str, &str)],
    ) -> u16 {
        let policy = deployment["uploads"]
            .as_array()
            .unwrap()
            .iter()
            .find(|upload| upload["path"] == path)
            .unwrap();
        let mut form = reqwest::multipart::Form::new();
        for (name, value) in policy["fields"].as_object().unwrap() {
            let changed = changes.iter().find(|(changed, _)| changed == name);
            let value = changed.map_or(value.as_str().unwrap(), |(_, value)| value);
            form = form.text(name.clone(), value.to_string());
        }
        // S3 reads the fields before the file, so the file goes last
        let file = reqwest::multipart::Part::bytes(content.to_vec()).file_name(path.to_string());
        let url = deployment["upload_url"].as_str().unwrap();
        let response = self
            .http
            .post(url)
            .multipart(form.part("file", file))
            .send()
            .await
            .unwrap();
        response.status().as_u16()
    }

    /// Stores a file straight into the bucket, as no client could with a policy.
    pub async fn put_object(&self, key: &str, content: &[u8]) {
        self.s3
            .put_object()
            .bucket(&self.settings().s3_bucket)
            .key(key)
            .checksum_algorithm(ChecksumAlgorithm::Sha256)
            .body(ByteStream::from(content.to_vec()))
            .send()
            .await
            .unwrap();
    }

    /// The bucket's keys under a prefix, sorted.
    pub async fn keys(&self, prefix: &str) -> Vec<String> {
        list_keys(&self.s3, &self.settings().s3_bucket, prefix).await
    }

    /// What the bucket stores at a key, with its checksum.
    pub async fn head(
        &self,
        key: &str,
    ) -> Option<aws_sdk_s3::operation::head_object::HeadObjectOutput> {
        self.s3
            .head_object()
            .bucket(&self.settings().s3_bucket)
            .key(key)
            .checksum_mode(ChecksumMode::Enabled)
            .send()
            .await
            .ok()
    }
}

async fn serve(state: AppState) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let app = redoost_api::app(state);
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    url
}

async fn reply(response: reqwest::Response) -> Reply {
    let status = response.status().as_u16();
    let headers = response.headers().clone();
    let bytes = response.bytes().await.unwrap();
    Reply {
        status,
        headers,
        body: serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    }
}

async fn list_keys(s3: &aws_sdk_s3::Client, bucket: &str, prefix: &str) -> Vec<String> {
    let mut pages = s3
        .list_objects_v2()
        .bucket(bucket)
        .prefix(prefix)
        .into_paginator()
        .send();
    let mut keys = Vec::new();
    while let Some(page) = pages.next().await {
        let page = page.expect("Garage isn't reachable at REDOOST_S3_ENDPOINT");
        keys.extend(
            page.contents()
                .iter()
                .filter_map(|object| object.key().map(String::from)),
        );
    }
    keys.sort();
    keys
}

async fn empty_bucket(s3: &aws_sdk_s3::Client, bucket: &str) {
    for batch in list_keys(s3, bucket, "").await.chunks(1000) {
        let objects = batch
            .iter()
            .map(|key| ObjectIdentifier::builder().key(key).build().unwrap())
            .collect();
        let delete = Delete::builder()
            .set_objects(Some(objects))
            .build()
            .unwrap();
        s3.delete_objects()
            .bucket(bucket)
            .delete(delete)
            .send()
            .await
            .unwrap();
    }
}

/// Distinct on every call, for IDs and subjects.
pub fn unique_hex() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{nanos:x}{:04x}", COUNTER.fetch_add(1, Ordering::Relaxed))
}

/// The base64 SHA-256 that manifests and S3 checksums use.
pub fn digest(content: &[u8]) -> String {
    STANDARD.encode(Sha256::digest(content))
}

/// A JWT's claims, read without checking its signature.
pub fn claims(token: &str) -> Value {
    let payload = token.split('.').nth(1).unwrap();
    serde_json::from_slice(&URL_SAFE_NO_PAD.decode(payload).unwrap()).unwrap()
}

pub fn time(value: &Value) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value.as_str().unwrap())
        .unwrap()
        .to_utc()
}

/// The sign-in a fake provider hands out next.
pub const REDIRECT_URI: &str = "https://redoost.example.com/auth/callback";

/// A minimal OIDC provider that checks the requests it gets, like test_oidc.py's mock.
#[derive(Clone)]
pub struct FakeProvider {
    /// Where the API finds the provider's configuration
    pub issuer: String,
    /// Where its endpoints are
    pub base: String,
    requests: Arc<Mutex<Vec<&'static str>>>,
    user: Arc<Mutex<Value>>,
    token_status: StatusCode,
    configuration: Option<&'static str>,
}

impl FakeProvider {
    pub async fn start() -> FakeProvider {
        FakeProvider::start_with(StatusCode::OK, None).await
    }

    /// A provider whose token endpoint answers with this status, and that serves
    /// this configuration instead of a real one.
    pub async fn start_with(
        token_status: StatusCode,
        configuration: Option<&'static str>,
    ) -> FakeProvider {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let provider = FakeProvider {
            issuer: format!("{base}/application/o/redoost/"),
            base,
            requests: Arc::default(),
            user: Arc::new(Mutex::new(json!({
                "sub": "subject-1",
                "email": "ada@example.com",
                "name": "Ada Lovelace",
            }))),
            token_status,
            configuration,
        };
        let app = Router::new()
            .route(
                "/application/o/redoost/.well-known/openid-configuration",
                get(configuration_endpoint),
            )
            .route("/token", post(token_endpoint))
            .route("/userinfo", get(userinfo_endpoint))
            .with_state(provider.clone());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        provider
    }

    /// The requests it got so far, like ["configuration", "token", "userinfo"].
    pub fn requests(&self) -> Vec<&'static str> {
        self.requests.lock().unwrap().clone()
    }

    /// Who signs in next.
    pub fn set_user(&self, user: Value) {
        *self.user.lock().unwrap() = user;
    }

    /// Points settings at this provider, instead of dev sign-in.
    pub fn configure(&self, settings: &mut Settings) {
        settings.dev_sign_in = false;
        settings.oidc_issuer = Some(self.issuer.parse().unwrap());
        settings.oidc_client_id = Some("redoost".into());
        settings.oidc_client_secret = Some("client-secret".into());
    }

    fn record(&self, request: &'static str) {
        self.requests.lock().unwrap().push(request);
    }
}

async fn configuration_endpoint(State(provider): State<FakeProvider>) -> axum::response::Response {
    use axum::response::IntoResponse;
    provider.record("configuration");
    if let Some(configuration) = provider.configuration {
        return configuration.into_response();
    }
    Json(json!({
        "authorization_endpoint": format!("{}/authorize", provider.base),
        "token_endpoint": format!("{}/token", provider.base),
        "userinfo_endpoint": format!("{}/userinfo", provider.base),
    }))
    .into_response()
}

async fn token_endpoint(
    State(provider): State<FakeProvider>,
    headers: HeaderMap,
    Form(form): Form<HashMap<String, String>>,
) -> (StatusCode, Json<Value>) {
    provider.record("token");
    let credentials = STANDARD.encode("redoost:client-secret");
    assert_eq!(headers["authorization"], format!("Basic {credentials}"));
    let expected = HashMap::from([
        ("grant_type".to_string(), "authorization_code".to_string()),
        ("code".to_string(), "code".to_string()),
        ("code_verifier".to_string(), "verifier".to_string()),
        ("redirect_uri".to_string(), REDIRECT_URI.to_string()),
    ]);
    assert_eq!(form, expected);
    (
        provider.token_status,
        Json(json!({"access_token": "access"})),
    )
}

async fn userinfo_endpoint(
    State(provider): State<FakeProvider>,
    headers: HeaderMap,
) -> Json<Value> {
    provider.record("userinfo");
    assert_eq!(headers["authorization"], "Bearer access");
    Json(provider.user.lock().unwrap().clone())
}

/// Exchanges a code for a sign-in, as the dashboard does after the provider redirects.
pub async fn sign_in(app: &TestApp) -> Reply {
    let body = json!({"code": "code", "code_verifier": "verifier", "redirect_uri": REDIRECT_URI});
    app.post("/api/auth/token", ANONYMOUS, body).await
}
