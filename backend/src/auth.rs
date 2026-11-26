use axum::body::Bytes;
use axum::extract::{FromRequestParts, Path, State};
use axum::http::StatusCode;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::{DateTime, TimeDelta, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::PgConnection;
use sqlx::types::Json as JsonColumn;

use crate::AppState;
use crate::config::{Provider, Settings};
use crate::error::{ApiError, ApiResult, parse_body};
use crate::models::{
    ApiToken, ApiTokenCreate, CliLoginClaim, Scope, SignIn, TokenSource, User, now, random_hex,
};
use crate::oidc;

const TOKEN_LIFETIME: TimeDelta = TimeDelta::days(30);
const CLI_LOGIN_LIFETIME: TimeDelta = TimeDelta::minutes(10);
// Keeps a sign-in link's ID from ever passing for a session token, or the reverse
const CLI_LOGIN_AUDIENCE: &str = "redoost:cli-login";
// Busy pipelines would otherwise write on every request
const RECORD_USE_EVERY: TimeDelta = TimeDelta::minutes(1);
// Prefixed, so the API tells them from its sign-in tokens and secret scanners find them
const API_TOKEN_PREFIX: &str = "rdo_";

pub fn router(settings: &Settings) -> Router<AppState> {
    let router = Router::new()
        .route("/api/auth/config", get(read_config))
        .route("/api/auth/me", get(read_user).delete(delete_user))
        .route(
            "/api/auth/tokens",
            post(create_api_token).get(list_api_tokens),
        )
        .route("/api/auth/tokens/current", delete(revoke_current_token))
        .route("/api/auth/tokens/{token_id}", delete(revoke_api_token))
        .route("/api/auth/cli", post(start_cli_login))
        .route("/api/auth/cli/{login_id}", post(approve_cli_login))
        .route("/api/auth/cli/{login_id}/token", post(claim_cli_login));
    // Only one way to sign in is served, depending on the settings
    if settings.oidc_issuer.is_some() {
        router.route("/api/auth/token", post(sign_in))
    } else {
        router.route("/api/auth/dev", post(sign_in_as_dev))
    }
}

#[derive(Serialize, Deserialize)]
struct SessionClaims {
    sub: String,
    iat: i64,
    exp: i64,
}

/// A dashboard session token for the user.
pub fn create_token(settings: &Settings, user_id: &str) -> String {
    let now = Utc::now();
    let claims = SessionClaims {
        sub: user_id.to_owned(),
        iat: now.timestamp(),
        exp: (now + TOKEN_LIFETIME).timestamp(),
    };
    sign(settings, &claims)
}

fn sign(settings: &Settings, claims: &impl Serialize) -> String {
    let key = EncodingKey::from_secret(settings.jwt_secret.as_bytes())
        .expect("the secret is checked at startup");
    jsonwebtoken::encode(&Header::new(Algorithm::HS256), claims, &key)
        .expect("HS256 signs any claims")
}

/// Claims signed with the API's secret, checked as PyJWT did: no leeway on expiry.
fn verify<T: serde::de::DeserializeOwned>(
    settings: &Settings,
    token: &str,
    validation: &mut Validation,
) -> Option<T> {
    validation.leeway = 0;
    let key = DecodingKey::from_secret(settings.jwt_secret.as_bytes())
        .expect("the secret is checked at startup");
    jsonwebtoken::decode(token, &key, validation)
        .ok()
        .map(|data| data.claims)
}

fn invalid_token() -> ApiError {
    ApiError::Unauthorized("Invalid token")
}

pub fn hash_secret(secret: &str) -> String {
    hex::encode(Sha256::digest(secret.as_bytes()))
}

/// Who a request comes from.
pub struct Principal {
    pub user: User,
    /// The API token the request came with, or None for a dashboard session
    pub token: Option<ApiToken>,
}

impl Principal {
    // A leaked token then can't make more tokens, or take over the account
    pub fn signed_in(&self) -> ApiResult<&User> {
        match self.token {
            Some(_) => Err(ApiError::new(
                StatusCode::FORBIDDEN,
                "Tokens can't manage the account",
            )),
            None => Ok(&self.user),
        }
    }

    // Reading comes with every scope, so only publishing and managing are checked
    pub fn needs(&self, scope: Scope) -> ApiResult<()> {
        match &self.token {
            Some(token) if !token.scopes.contains(&scope) => Err(ApiError::new(
                StatusCode::FORBIDDEN,
                format!("This token can't {} sites", scope.name()),
            )),
            _ => Ok(()),
        }
    }
}

impl FromRequestParts<AppState> for Principal {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> ApiResult<Principal> {
        let header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("");
        let (scheme, credentials) = header.split_once(' ').unwrap_or((header, ""));
        if scheme.is_empty() || credentials.is_empty() {
            return Err(ApiError::Unauthorized("Not authenticated"));
        }
        if !scheme.eq_ignore_ascii_case("bearer") {
            return Err(ApiError::Unauthorized("Invalid authentication credentials"));
        }
        if credentials.starts_with(API_TOKEN_PREFIX) {
            return api_token_principal(state, credentials).await;
        }
        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_required_spec_claims(&["exp", "sub"]);
        let claims: SessionClaims =
            verify(&state.settings, credentials, &mut validation).ok_or_else(invalid_token)?;
        let user = find_user(&mut *state.db.acquire().await?, &claims.sub)
            .await?
            .ok_or_else(invalid_token)?;
        Ok(Principal { user, token: None })
    }
}

async fn api_token_principal(state: &AppState, token: &str) -> ApiResult<Principal> {
    let mut db = state.db.acquire().await?;
    let api_token: Option<ApiToken> =
        sqlx::query_as("SELECT * FROM api_token WHERE secret_hash = $1")
            .bind(hash_secret(token))
            .fetch_optional(&mut *db)
            .await?;
    let now = now();
    let api_token = api_token.filter(|api_token| {
        api_token
            .expires_at
            .is_none_or(|expires_at| expires_at > now)
    });
    let Some(mut api_token) = api_token else {
        return Err(invalid_token());
    };
    let user = find_user(&mut db, &api_token.user_id)
        .await?
        .ok_or_else(invalid_token)?;
    if api_token
        .last_used_at
        .is_none_or(|last_used_at| now - last_used_at > RECORD_USE_EVERY)
    {
        api_token.last_used_at = Some(now);
        sqlx::query("UPDATE api_token SET last_used_at = $2 WHERE id = $1")
            .bind(&api_token.id)
            .bind(now)
            .execute(&mut *db)
            .await?;
    }
    Ok(Principal {
        user,
        token: Some(api_token),
    })
}

async fn find_user(db: &mut PgConnection, id: &str) -> sqlx::Result<Option<User>> {
    sqlx::query_as("SELECT * FROM users WHERE id = $1")
        .bind(id)
        .fetch_optional(db)
        .await
}

async fn read_config(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let settings = &state.settings;
    let (Some(_), Some(client_id)) = (&settings.oidc_issuer, &settings.oidc_client_id) else {
        return Ok(Json(json!({"oidc": null, "dev": settings.dev_sign_in})));
    };
    let metadata = oidc::read_metadata(&state)
        .await
        .map_err(|error| ApiError::new(StatusCode::BAD_GATEWAY, error.0))?;
    Ok(Json(json!({
        "oidc": {
            "provider": settings.oidc_provider,
            "authorization_endpoint": metadata.authorization_endpoint,
            "client_id": client_id,
            "scope": oidc::SCOPE,
        },
        "dev": false,
    })))
}

async fn read_user(principal: Principal) -> Json<User> {
    Json(principal.user)
}

async fn delete_user(State(state): State<AppState>, principal: Principal) -> ApiResult<StatusCode> {
    let user = principal.signed_in()?;
    let mut tx = state.db.begin().await?;
    let slugs: Vec<String> = sqlx::query_scalar("SELECT slug FROM deployment WHERE owner_id = $1")
        .bind(&user.id)
        .fetch_all(&mut *tx)
        .await?;
    // Files go first, so a failed delete leaves the account in place to retry
    state.storage.delete_sites(&slugs).await?;
    sqlx::query("DELETE FROM deployment WHERE owner_id = $1")
        .bind(&user.id)
        .execute(&mut *tx)
        .await?;
    // Its tokens, sign-ins, offers, and discarded folders go with it
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(&user.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// A token and its secret, which is handed out once and kept only as a hash.
async fn new_api_token(
    db: &mut PgConnection,
    user: &User,
    name: &str,
    source: TokenSource,
    scopes: Vec<Scope>,
    expires_at: Option<DateTime<Utc>>,
) -> sqlx::Result<(ApiToken, String)> {
    let secret = format!("{API_TOKEN_PREFIX}{}", token_urlsafe(32));
    let api_token = ApiToken {
        id: token_urlsafe(12),
        name: name.to_owned(),
        secret_hash: hash_secret(&secret),
        user_id: user.id.clone(),
        source,
        scopes: JsonColumn(scopes),
        created_at: now(),
        last_used_at: None,
        expires_at,
    };
    sqlx::query(
        "INSERT INTO api_token (id, name, secret_hash, user_id, source, scopes, created_at, last_used_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(&api_token.id)
    .bind(&api_token.name)
    .bind(&api_token.secret_hash)
    .bind(&api_token.user_id)
    .bind(api_token.source)
    .bind(&api_token.scopes)
    .bind(api_token.created_at)
    .bind(api_token.last_used_at)
    .bind(api_token.expires_at)
    .execute(db)
    .await?;
    Ok((api_token, secret))
}

/// Random bytes as URL-safe base64, like Python's secrets.token_urlsafe.
fn token_urlsafe(bytes: usize) -> String {
    let mut buffer = vec![0; bytes];
    rand::fill(&mut buffer[..]);
    URL_SAFE_NO_PAD.encode(buffer)
}

#[derive(Serialize)]
struct ApiTokenCreated {
    #[serde(flatten)]
    api_token: ApiToken,
    /// The token, shown only this once
    token: String,
}

async fn create_api_token(
    State(state): State<AppState>,
    principal: Principal,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<ApiTokenCreated>)> {
    let user = principal.signed_in()?;
    let mut body: ApiTokenCreate = parse_body(&body)?;
    body.validate()?;
    let mut db = state.db.acquire().await?;
    let (api_token, token) = new_api_token(
        &mut db,
        user,
        &body.name,
        TokenSource::Manual,
        body.scopes,
        body.expires_at,
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(ApiTokenCreated { api_token, token }),
    ))
}

async fn list_api_tokens(
    State(state): State<AppState>,
    principal: Principal,
) -> ApiResult<Json<Vec<ApiToken>>> {
    let user = principal.signed_in()?;
    let api_tokens =
        sqlx::query_as("SELECT * FROM api_token WHERE user_id = $1 ORDER BY created_at DESC")
            .bind(&user.id)
            .fetch_all(&state.db)
            .await?;
    Ok(Json(api_tokens))
}

// Signs a CLI out; a dashboard session has no token to revoke
async fn revoke_current_token(
    State(state): State<AppState>,
    principal: Principal,
) -> ApiResult<StatusCode> {
    if let Some(api_token) = principal.token {
        sqlx::query("DELETE FROM api_token WHERE id = $1")
            .bind(api_token.id)
            .execute(&state.db)
            .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn revoke_api_token(
    State(state): State<AppState>,
    principal: Principal,
    Path(token_id): Path<String>,
) -> ApiResult<StatusCode> {
    let user = principal.signed_in()?;
    let deleted = sqlx::query("DELETE FROM api_token WHERE id = $1 AND user_id = $2")
        .bind(token_id)
        .bind(&user.id)
        .execute(&state.db)
        .await?;
    if deleted.rows_affected() == 0 {
        return Err(ApiError::new(StatusCode::NOT_FOUND, "Token not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

fn expired_link() -> ApiError {
    ApiError::new(
        StatusCode::NOT_FOUND,
        "Sign-in link has expired or was already used",
    )
}

#[derive(Serialize, Deserialize)]
struct CliLoginClaims {
    aud: String,
    secret_hash: String,
    exp: i64,
}

// The CLI prints a link to approve anywhere, then polls until it's approved. The
// link's ID is signed rather than stored, so starting sign-ins, which anyone can,
// writes nothing until a signed-in user approves one.
async fn start_cli_login(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    let secret = token_urlsafe(32);
    // Whole seconds, as the ID carries it
    let expires_at = Utc::now() + CLI_LOGIN_LIFETIME;
    let claims = CliLoginClaims {
        aud: CLI_LOGIN_AUDIENCE.into(),
        secret_hash: hash_secret(&secret),
        exp: expires_at.timestamp(),
    };
    let login_id = sign(&state.settings, &claims);
    let expires_at = DateTime::from_timestamp(claims.exp, 0).expect("now is a valid time");
    (
        StatusCode::CREATED,
        Json(json!({"id": login_id, "secret": secret, "expires_at": expires_at})),
    )
}

/// The hash of the secret a sign-in link was started with, and its expiry.
fn read_cli_login(settings: &Settings, login_id: &str) -> ApiResult<(String, DateTime<Utc>)> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&[CLI_LOGIN_AUDIENCE]);
    validation.set_required_spec_claims(&["aud", "exp"]);
    let claims: CliLoginClaims =
        verify(settings, login_id, &mut validation).ok_or_else(expired_link)?;
    let expires_at = DateTime::from_timestamp(claims.exp, 0).ok_or_else(expired_link)?;
    Ok((claims.secret_hash, expires_at))
}

// One row per link, so a link can only ever be approved once, by one user
async fn approve_cli_login(
    State(state): State<AppState>,
    principal: Principal,
    Path(login_id): Path<String>,
) -> ApiResult<StatusCode> {
    let user = principal.signed_in()?;
    let (secret_hash, expires_at) = read_cli_login(&state.settings, &login_id)?;
    let inserted = sqlx::query(
        "INSERT INTO cli_login (id, secret_hash, user_id, expires_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING",
    )
    .bind(&login_id)
    .bind(secret_hash)
    .bind(&user.id)
    .bind(expires_at)
    .execute(&state.db)
    .await?;
    if inserted.rows_affected() == 0 {
        return Err(expired_link());
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
struct Token {
    /// Bearer token for the API
    token: String,
    /// Who the token belongs to
    user: User,
}

async fn claim_cli_login(
    State(state): State<AppState>,
    Path(login_id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let mut body: CliLoginClaim = parse_body(&body)?;
    body.validate()?;
    let mut tx = state.db.begin().await?;
    // Its secret is cleared as it's claimed, so it gives out one token at most; the
    // row stays until it expires, so the link can't be approved again
    let user_id: Option<Option<String>> = sqlx::query_scalar(
        "UPDATE cli_login SET secret_hash = '' WHERE id = $1 AND secret_hash = $2 AND expires_at > $3
         RETURNING user_id",
    )
    .bind(&login_id)
    .bind(hash_secret(&body.secret))
    .bind(now())
    .fetch_optional(&mut *tx)
    .await?;
    let user = match user_id.flatten() {
        Some(user_id) => find_user(&mut tx, &user_id).await?,
        None => None,
    };
    let Some(user) = user else {
        let (secret_hash, _) = read_cli_login(&state.settings, &login_id)?;
        let stored: Option<String> = sqlx::query_scalar("SELECT id FROM cli_login WHERE id = $1")
            .bind(&login_id)
            .fetch_optional(&mut *tx)
            .await?;
        // Not approved in the browser yet
        if constant_time_eq(&secret_hash, &hash_secret(&body.secret)) && stored.is_none() {
            return Ok(StatusCode::ACCEPTED.into_response());
        }
        return Err(expired_link());
    };
    // Revocable from the dashboard, unlike the session tokens the browser gets
    let expires_at = now() + TOKEN_LIFETIME;
    let (_, token) = new_api_token(
        &mut tx,
        &user,
        &body.name,
        TokenSource::Cli,
        Scope::ALL.into(),
        Some(expires_at),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(Token { token, user }).into_response())
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.bytes()
            .zip(b.bytes())
            .fold(0, |diff, (x, y)| diff | (x ^ y))
            == 0
}

/// Finds or creates the user in one statement, keeping their details current.
pub async fn sign_in_user(
    db: &mut PgConnection,
    provider: Provider,
    subject: &str,
    email: Option<&str>,
    name: Option<&str>,
    picture: Option<&str>,
) -> sqlx::Result<User> {
    sqlx::query_as(
        "INSERT INTO users (id, provider, subject, email, name, picture, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (provider, subject) DO UPDATE
         SET email = excluded.email, name = excluded.name, picture = excluded.picture
         RETURNING *",
    )
    .bind(random_hex(16))
    .bind(provider)
    .bind(subject)
    .bind(email)
    .bind(name)
    .bind(picture)
    .bind(now())
    .fetch_one(db)
    .await
}

fn session(settings: &Settings, user: User) -> Json<Token> {
    Json(Token {
        token: create_token(settings, &user.id),
        user,
    })
}

async fn sign_in_as_dev(State(state): State<AppState>) -> ApiResult<Json<Token>> {
    let mut db = state.db.acquire().await?;
    // Google's subjects are numeric, so this can't be a real account
    let user = sign_in_user(
        &mut db,
        Provider::Google,
        "dev",
        Some("dev@localhost"),
        Some("Dev User"),
        None,
    )
    .await?;
    Ok(session(&state.settings, user))
}

async fn sign_in(State(state): State<AppState>, body: Bytes) -> ApiResult<Json<Token>> {
    let body: SignIn = parse_body(&body)?;
    let info = oidc::read_userinfo(&state, &body.code, &body.code_verifier, &body.redirect_uri)
        .await
        .map_err(|error| ApiError::new(StatusCode::BAD_REQUEST, error.0))?;
    let mut db = state.db.acquire().await?;
    // Kept current, since users can change them at the provider
    let user = sign_in_user(
        &mut db,
        state.settings.oidc_provider,
        &info.sub,
        info.email.as_deref(),
        info.name.as_deref(),
        info.picture.as_deref(),
    )
    .await?;
    Ok(session(&state.settings, user))
}
