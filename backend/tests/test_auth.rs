mod common;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::{Duration, SubsecRound, Utc};
use common::{ANONYMOUS, FakeProvider, Reply, TestApp, claims, digest, sign_in, time, unreachable};
use jsonwebtoken::{EncodingKey, Header};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

const CONTENT: &[u8] = b"x";

fn manifest() -> Value {
    json!({"files": [{"path": "index.html", "size": 1, "sha256": digest(CONTENT)}]})
}

/// Starts a site, uploading its file but leaving it unpublished.
async fn start_site(app: &TestApp, token: &str) -> Value {
    let created = app.post("/api/deployments", token, manifest()).await;
    assert_eq!(created.status, 201);
    assert_eq!(app.upload(&created.body, "index.html", CONTENT).await, 204);
    created.body
}

async fn publish(app: &TestApp, token: &str) -> String {
    let slug = start_site(app, token).await["slug"]
        .as_str()
        .unwrap()
        .to_string();
    let url = format!("/api/deployments/{slug}/complete");
    assert_eq!(app.post(&url, token, manifest()).await.status, 200);
    slug
}

fn sign(claims: &Value, secret: &str) -> String {
    jsonwebtoken::encode(
        &Header::default(),
        claims,
        &EncodingKey::from_secret(secret.as_bytes()).unwrap(),
    )
    .unwrap()
}

fn user_id(token: &str) -> String {
    claims(token)["sub"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn config_with_dev_sign_in() {
    let app = TestApp::start().await;
    let response = app.get("/api/auth/config", ANONYMOUS).await;

    assert_eq!(response.body, json!({"oidc": null, "dev": true}));
}

#[tokio::test]
async fn dev_sign_in() {
    let app = TestApp::start().await;
    let response = app.post("/api/auth/dev", ANONYMOUS, Value::Null).await;

    assert_eq!(response.status, 200);
    let body = response.body;
    assert_eq!(
        body["user"],
        json!({
            "id": body["user"]["id"],
            "provider": "google",
            "email": "dev@localhost",
            "name": "Dev User",
            "picture": null,
        })
    );
    let expires_in = claims(body["token"].as_str().unwrap())["exp"]
        .as_i64()
        .unwrap()
        - Utc::now().timestamp();
    assert!(Duration::days(29).num_seconds() < expires_in);
    assert!(expires_in <= Duration::days(30).num_seconds());
    // Signing in again finds the same dev user
    let again = app.post("/api/auth/dev", ANONYMOUS, Value::Null).await.body;
    assert_eq!(again["user"]["id"], body["user"]["id"]);
    let me = app
        .get("/api/auth/me", again["token"].as_str().unwrap())
        .await;
    assert_eq!(me.body, body["user"]);
}

#[tokio::test]
async fn rejects_invalid_tokens() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let claims = claims(&token);
    let secret = app.settings().jwt_secret.clone();
    let past = Utc::now().timestamp() - 1;
    let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"none","typ":"JWT"}"#);
    let payload = URL_SAFE_NO_PAD.encode(claims.to_string());
    let mut expired = claims.clone();
    expired["exp"] = json!(past);
    let mut unknown_user = claims.clone();
    unknown_user["sub"] = json!("missing");
    let invalid = [
        "not-a-token".to_string(),
        sign(&claims, "another-secret-that-is-long-enough"),
        format!("{header}.{payload}."),
        sign(&expired, &secret),
        sign(&unknown_user, &secret),
        sign(&json!({"sub": claims["sub"]}), &secret),
        sign(
            &json!({"sub": claims["sub"], "iat": claims["iat"]}),
            &secret,
        ),
    ];

    for value in invalid {
        let response = app.get("/api/auth/me", &value).await;
        assert_eq!(response.status, 401, "{value}");
        assert_eq!(response.header("www-authenticate"), "Bearer");
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn concurrent_first_sign_ins_find_the_same_user() {
    let app = TestApp::start().await;
    let sign_in = || app.post("/api/auth/dev", ANONYMOUS, Value::Null);

    let signed_in = tokio::join!(sign_in(), sign_in(), sign_in(), sign_in(), sign_in());

    let ids = [
        signed_in.0,
        signed_in.1,
        signed_in.2,
        signed_in.3,
        signed_in.4,
    ]
    .map(|response| response.body["user"]["id"].clone());
    assert!(
        ids.iter().all(|id| id.is_string() && *id == ids[0]),
        "{ids:?}"
    );
}

#[tokio::test]
async fn sign_in_is_unavailable_without_oidc() {
    let app = TestApp::start().await;
    let body = json!({"code": "code", "code_verifier": "verifier", "redirect_uri": "uri"});

    assert_eq!(
        app.post("/api/auth/token", ANONYMOUS, body).await.status,
        404
    );
}

#[tokio::test]
async fn deleting_an_account_removes_its_sites() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let published = publish(&app, &token).await;
    let uploading = start_site(&app, &token).await["slug"]
        .as_str()
        .unwrap()
        .to_string();
    let other = app.new_token().await;
    let kept = start_site(&app, &other).await["slug"]
        .as_str()
        .unwrap()
        .to_string();

    let response = app.delete("/api/auth/me", &token).await;

    assert_eq!(response.status, 204);
    assert!(app.keys(&format!("{published}/")).await.is_empty());
    assert!(app.keys(&format!("{uploading}/")).await.is_empty());
    // Its tokens stop working, and other users keep their sites
    assert_eq!(app.get("/api/auth/me", &token).await.status, 401);
    let kept_url = format!("/api/deployments/{kept}");
    assert_eq!(app.get(&kept_url, &other).await.status, 200);
    assert!(!app.keys(&format!("{kept}/")).await.is_empty());
}

#[tokio::test]
async fn failed_deletes_keep_the_account() {
    let mut app = TestApp::start().await;
    let token = app.new_token().await;
    app.post("/api/deployments", &token, manifest()).await;
    app.reconfigure(|settings| settings.s3_endpoint = unreachable())
        .await;

    let response = app.delete("/api/auth/me", &token).await;

    assert!(response.status >= 500, "{response:?}");
    assert_eq!(app.get("/api/auth/me", &token).await.status, 200);
}

#[tokio::test]
async fn deleting_an_account_requires_a_user() {
    let app = TestApp::start().await;
    assert_eq!(app.delete("/api/auth/me", ANONYMOUS).await.status, 401);
}

async fn create_api_token(app: &TestApp, token: &str, body: Value) -> Reply {
    let mut full = json!({"name": "CI", "scopes": ["read", "publish", "manage"]});
    full.as_object_mut()
        .unwrap()
        .extend(body.as_object().unwrap().clone());
    app.post("/api/auth/tokens", token, full).await
}

#[tokio::test]
async fn api_tokens_publish_without_signing_in() {
    let app = TestApp::start().await;
    let token = app.new_token().await;

    let response = create_api_token(&app, &token, json!({"name": " GitHub Actions "})).await;
    assert_eq!(response.status, 201);
    let created = response.body;
    assert_eq!(created["name"], "GitHub Actions");
    assert_eq!(created["source"], "manual");
    assert!(created["token"].as_str().unwrap().starts_with("rdo_"));
    assert_eq!(created["last_used_at"], Value::Null);
    assert_eq!(created["expires_at"], Value::Null);
    let api_token = created["token"].as_str().unwrap();

    let me = app.get("/api/auth/me", api_token).await;
    assert_eq!(me.status, 200);
    assert_eq!(
        me.body["id"],
        app.get("/api/auth/me", &token).await.body["id"]
    );
    let published = app.post("/api/deployments", api_token, manifest()).await;
    assert_eq!(published.status, 201);

    // Listed without the token itself, which was shown once
    let listed = app.get("/api/auth/tokens", &token).await.body;
    let listed = listed.as_array().unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0]["name"], "GitHub Actions");
    assert!(listed[0].get("token").is_none());
    assert!(!listed[0]["last_used_at"].is_null());
}

#[tokio::test]
async fn api_tokens_need_a_name_and_scopes() {
    let app = TestApp::start().await;
    let token = app.new_token().await;

    for invalid in [
        json!({"name": "  "}),
        json!({"name": "x".repeat(101)}),
        json!({"scopes": []}),
        json!({"scopes": ["admin"]}),
    ] {
        assert_eq!(
            create_api_token(&app, &token, invalid.clone()).await.status,
            422,
            "{invalid}"
        );
    }
    // Repeats are dropped
    let response = create_api_token(&app, &token, json!({"scopes": ["read", "read"]})).await;
    assert_eq!(response.body["scopes"], json!(["read"]));
}

#[tokio::test]
async fn api_tokens_are_held_to_their_scopes() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let with_scope = async |scope: &str| {
        let created = create_api_token(&app, &token, json!({"scopes": [scope]})).await;
        created.body["token"].as_str().unwrap().to_string()
    };
    let publisher = with_scope("publish").await;
    let manager = with_scope("manage").await;
    let reader = with_scope("read").await;

    // Reading comes with every scope
    for api_token in [&publisher, &manager, &reader] {
        assert_eq!(app.get("/api/deployments", api_token).await.status, 200);
        assert_eq!(
            app.get("/api/deployments/usage", api_token).await.status,
            200
        );
    }

    let published = app.post("/api/deployments", &publisher, manifest()).await;
    assert_eq!(published.status, 201);
    let url = format!(
        "/api/deployments/{}",
        published.body["slug"].as_str().unwrap()
    );
    assert_eq!(
        app.post(&format!("{url}/cancel"), &manager, Value::Null)
            .await
            .status,
        403
    );
    assert_eq!(
        app.post("/api/deployments", &reader, manifest())
            .await
            .status,
        403
    );
    let change = json!({"enabled": false});
    assert_eq!(app.patch(&url, &reader, change.clone()).await.status, 403);
    let response = app.patch(&url, &publisher, change.clone()).await;
    assert_eq!(response.status, 403);
    assert_eq!(response.body["detail"], "This token can't manage sites");
    assert_eq!(app.patch(&url, &manager, change).await.status, 200);
}

#[tokio::test]
async fn api_tokens_can_expire() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let past = Utc::now() - Duration::minutes(1);
    let response = create_api_token(&app, &token, json!({"expires_at": past.to_rfc3339()})).await;
    assert_eq!(response.status, 422);

    let soon = (Utc::now() + Duration::seconds(1)).trunc_subsecs(6);
    let created = create_api_token(&app, &token, json!({"expires_at": soon.to_rfc3339()}))
        .await
        .body;
    assert_eq!(time(&created["expires_at"]), soon);
    let api_token = created["token"].as_str().unwrap();
    assert_eq!(app.get("/api/auth/me", api_token).await.status, 200);

    sqlx::query("UPDATE api_token SET expires_at = now() - interval '1 second' WHERE id = $1")
        .bind(created["id"].as_str().unwrap())
        .execute(&app.db)
        .await
        .unwrap();
    assert_eq!(app.get("/api/auth/me", api_token).await.status, 401);
    app.cleanup().await;
    assert_eq!(app.get("/api/auth/tokens", &token).await.body, json!([]));
}

#[tokio::test]
async fn revoked_api_tokens_stop_working() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let created = create_api_token(&app, &token, json!({})).await.body;
    let url = format!("/api/auth/tokens/{}", created["id"].as_str().unwrap());

    // Only its owner can revoke it
    assert_eq!(app.delete(&url, &app.new_token().await).await.status, 404);
    assert_eq!(app.delete(&url, &token).await.status, 204);
    assert_eq!(app.delete(&url, &token).await.status, 404);
    let api_token = created["token"].as_str().unwrap();
    assert_eq!(app.get("/api/auth/me", api_token).await.status, 401);
    assert_eq!(app.get("/api/auth/tokens", &token).await.body, json!([]));
}

#[tokio::test]
async fn api_tokens_cannot_manage_the_account() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let api_token = create_api_token(&app, &token, json!({})).await.body["token"]
        .as_str()
        .unwrap()
        .to_string();
    let login = start_cli_login(&app).await;

    assert_eq!(
        create_api_token(&app, &api_token, json!({})).await.status,
        403
    );
    assert_eq!(app.get("/api/auth/tokens", &api_token).await.status, 403);
    assert_eq!(app.delete("/api/auth/me", &api_token).await.status, 403);
    assert_eq!(approve(&app, &login, &api_token).await.status, 403);
    assert_eq!(app.get("/api/auth/me", &token).await.status, 200);
}

#[tokio::test]
async fn deleting_an_account_revokes_its_api_tokens() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let created = create_api_token(&app, &token, json!({})).await.body;

    assert_eq!(app.delete("/api/auth/me", &token).await.status, 204);
    assert_eq!(
        app.get("/api/auth/me", created["token"].as_str().unwrap())
            .await
            .status,
        401
    );
}

async fn start_cli_login(app: &TestApp) -> Value {
    app.post("/api/auth/cli", ANONYMOUS, Value::Null).await.body
}

async fn approve(app: &TestApp, login: &Value, token: &str) -> Reply {
    let url = format!("/api/auth/cli/{}", login["id"].as_str().unwrap());
    app.post(&url, token, Value::Null).await
}

async fn claim(app: &TestApp, login: &Value) -> Reply {
    claim_with(app, login, json!({"secret": login["secret"]})).await
}

async fn claim_with(app: &TestApp, login: &Value, body: Value) -> Reply {
    let url = format!("/api/auth/cli/{}/token", login["id"].as_str().unwrap());
    app.post(&url, ANONYMOUS, body).await
}

#[tokio::test]
async fn cli_sign_in() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let login = start_cli_login(&app).await;
    // Pending until it's approved in the browser
    assert_eq!(claim(&app, &login).await.status, 202);

    assert_eq!(approve(&app, &login, &token).await.status, 204);
    let response = claim(&app, &login).await;
    assert_eq!(response.status, 200);
    let cli_token = response.body["token"].as_str().unwrap();
    assert!(cli_token.starts_with("rdo_"));
    let me = app.get("/api/auth/me", cli_token).await;
    assert_eq!(me.body["id"], user_id(&token));
    // Each link signs in once
    assert_eq!(claim(&app, &login).await.status, 404);
    // A link's ID is signed like a session token, but never works as one
    assert_eq!(
        app.get("/api/auth/me", login["id"].as_str().unwrap())
            .await
            .status,
        401
    );
    assert_eq!(
        approve(&app, &json!({"id": token}), &token).await.status,
        404
    );
}

#[tokio::test]
async fn starting_cli_sign_ins_stores_nothing() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let stored = async |id: &Value| -> bool {
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM cli_login WHERE id = $1)")
            .bind(id.as_str().unwrap())
            .fetch_one(&app.db)
            .await
            .unwrap()
    };

    // Anyone can start one, so only approving one writes a row
    let login = start_cli_login(&app).await;
    assert!(!stored(&login["id"]).await);
    approve(&app, &login, &token).await;
    assert!(stored(&login["id"]).await);
}

#[tokio::test]
async fn cli_sign_ins_are_tokens_the_dashboard_can_revoke() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let login = start_cli_login(&app).await;
    approve(&app, &login, &token).await;
    let body = json!({"secret": login["secret"], "name": "CLI on laptop"});
    let cli_token = claim_with(&app, &login, body).await.body["token"]
        .as_str()
        .unwrap()
        .to_string();

    let listed = app.get("/api/auth/tokens", &token).await.body;
    let [listed] = listed.as_array().unwrap().as_slice() else {
        panic!("{listed}");
    };
    assert_eq!(listed["name"], "CLI on laptop");
    assert_eq!(listed["source"], "cli");
    assert_eq!(listed["scopes"], json!(["read", "publish", "manage"]));
    let expires_in = time(&listed["expires_at"]) - Utc::now();
    assert!(Duration::days(29) < expires_in && expires_in <= Duration::days(30));

    // The CLI signs itself out, while a browser session has nothing to revoke
    assert_eq!(
        app.delete("/api/auth/tokens/current", &token).await.status,
        204
    );
    assert_eq!(
        app.delete("/api/auth/tokens/current", &cli_token)
            .await
            .status,
        204
    );
    assert_eq!(app.get("/api/auth/me", &cli_token).await.status, 401);
    assert_eq!(app.get("/api/auth/tokens", &token).await.body, json!([]));
}

#[tokio::test]
async fn cli_sign_in_needs_the_cli_secret() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let login = start_cli_login(&app).await;
    approve(&app, &login, &token).await;

    assert_eq!(
        claim_with(&app, &login, json!({"secret": "wrong"}))
            .await
            .status,
        404
    );
    assert_eq!(claim(&app, &login).await.status, 200);
}

#[tokio::test]
async fn cli_sign_in_links_are_approved_once() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let login = start_cli_login(&app).await;

    assert_eq!(approve(&app, &login, ANONYMOUS).await.status, 401);
    assert_eq!(approve(&app, &login, &token).await.status, 204);
    assert_eq!(
        approve(&app, &login, &app.new_token().await).await.status,
        404
    );
    let claimed = claim(&app, &login).await.body;
    assert_eq!(claimed["user"]["id"], user_id(&token));
}

#[tokio::test]
async fn cli_sign_in_links_expire() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    // Signed like the API signs links, but already past its expiry
    let secret = "expired-secret";
    let secret_hash = hex::encode(Sha256::digest(secret));
    let claims = json!({
        "aud": "redoost:cli-login",
        "secret_hash": secret_hash,
        "exp": Utc::now().timestamp() - 1,
    });
    let login = json!({"id": sign(&claims, &app.settings().jwt_secret), "secret": secret});

    assert_eq!(approve(&app, &login, &token).await.status, 404);
    assert_eq!(claim(&app, &login).await.status, 404);
}

#[tokio::test]
async fn cleanup_removes_expired_cli_sign_ins() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let stored = async |login: &Value| -> bool {
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM cli_login WHERE id = $1)")
            .bind(login["id"].as_str().unwrap())
            .fetch_one(&app.db)
            .await
            .unwrap()
    };
    let kept = start_cli_login(&app).await;
    let expired = start_cli_login(&app).await;
    approve(&app, &kept, &token).await;
    approve(&app, &expired, &token).await;
    sqlx::query("UPDATE cli_login SET expires_at = now() - interval '1 second' WHERE id = $1")
        .bind(expired["id"].as_str().unwrap())
        .execute(&app.db)
        .await
        .unwrap();

    app.cleanup().await;
    assert!(!stored(&expired).await);
    assert!(stored(&kept).await);
}

#[tokio::test]
async fn deleting_an_account_removes_its_cli_sign_ins() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let login = start_cli_login(&app).await;
    approve(&app, &login, &token).await;

    assert_eq!(app.delete("/api/auth/me", &token).await.status, 204);
    // Back to waiting for approval, so it never gives out a token
    assert_eq!(claim(&app, &login).await.status, 202);
}

/// The API, signing users in with a fake OIDC provider.
async fn accounts() -> (TestApp, FakeProvider) {
    let provider = FakeProvider::start().await;
    let app = TestApp::start_with(|settings| provider.configure(settings)).await;
    (app, provider)
}

/// Signs in as Ada, with these changes to what the provider says about her.
async fn sign_in_as(app: &TestApp, provider: &FakeProvider, changes: Value) -> Reply {
    let mut user = json!({
        "sub": "subject-1",
        "email": "ada@example.com",
        "name": "Ada Lovelace",
        "picture": "https://lh3.googleusercontent.com/a/ada",
    });
    user.as_object_mut()
        .unwrap()
        .extend(changes.as_object().unwrap().clone());
    provider.set_user(user);
    sign_in(app).await
}

#[tokio::test]
async fn config_with_sign_in() {
    let (app, provider) = accounts().await;

    assert_eq!(
        app.get("/api/auth/config", ANONYMOUS).await.body,
        json!({
            "oidc": {
                "provider": "google",
                "authorization_endpoint": format!("{}/authorize", provider.base),
                "client_id": "redoost",
                "scope": "openid email profile",
            },
            "dev": false,
        })
    );
}

#[tokio::test]
async fn config_reports_an_unreachable_provider() {
    let app = TestApp::start_with(|settings| {
        settings.dev_sign_in = false;
        settings.oidc_issuer = Some(unreachable());
        settings.oidc_client_id = Some("redoost".into());
        settings.oidc_client_secret = Some("client-secret".into());
    })
    .await;

    assert_eq!(app.get("/api/auth/config", ANONYMOUS).await.status, 502);
}

#[tokio::test]
async fn oidc_sign_in() {
    let (app, provider) = accounts().await;
    let response = sign_in_as(&app, &provider, json!({})).await;

    assert_eq!(response.status, 200);
    let body = response.body;
    assert_eq!(
        body["user"],
        json!({
            "id": body["user"]["id"],
            "provider": "google",
            "email": "ada@example.com",
            "name": "Ada Lovelace",
            "picture": "https://lh3.googleusercontent.com/a/ada",
        })
    );
    let token = body["token"].as_str().unwrap();
    let expires_in = claims(token)["exp"].as_i64().unwrap() - Utc::now().timestamp();
    assert!(Duration::days(29).num_seconds() < expires_in);
    assert!(expires_in <= Duration::days(30).num_seconds());
    assert_eq!(app.get("/api/auth/me", token).await.body, body["user"]);
}

#[tokio::test]
async fn signing_in_again_finds_the_same_user() {
    let (app, provider) = accounts().await;
    let first = sign_in_as(&app, &provider, json!({})).await.body["user"].clone();
    let again = sign_in_as(&app, &provider, json!({"email": "ada@example.org"}))
        .await
        .body["user"]
        .clone();
    let other = sign_in_as(&app, &provider, json!({"sub": "subject-2"}))
        .await
        .body["user"]
        .clone();

    assert_eq!(again["id"], first["id"]);
    // Profile details follow the provider
    assert_eq!(again["email"], "ada@example.org");
    assert_ne!(other["id"], first["id"]);
    let removed = sign_in_as(&app, &provider, json!({"picture": null}))
        .await
        .body["user"]
        .clone();
    assert_eq!(removed["picture"], Value::Null);
}

#[tokio::test]
async fn signing_in_again_keeps_details_current() {
    let (app, provider) = accounts().await;
    let created_at = async |id: &Value| -> chrono::DateTime<Utc> {
        sqlx::query_scalar("SELECT created_at FROM users WHERE id = $1")
            .bind(id.as_str().unwrap())
            .fetch_one(&app.db)
            .await
            .unwrap()
    };

    let first = sign_in_as(&app, &provider, json!({"email": "old@example.com"}))
        .await
        .body["user"]
        .clone();
    let second = sign_in_as(&app, &provider, json!({"email": "new@example.com"}))
        .await
        .body["user"]
        .clone();

    assert_eq!(second["id"], first["id"]);
    assert_eq!(second["email"], "new@example.com");
    let first_created = created_at(&first["id"]).await;
    // The row was updated, not made again
    assert_eq!(created_at(&second["id"]).await, first_created);
}

#[tokio::test]
async fn keeps_only_secure_pictures() {
    let (app, provider) = accounts().await;
    for (picture, kept) in [
        ("https://lh3.googleusercontent.com/a/ada", true),
        ("http://example.com/ada.png", false),
        ("javascript:alert(1)", false),
    ] {
        let user = sign_in_as(&app, &provider, json!({"picture": picture}))
            .await
            .body["user"]
            .clone();
        assert_eq!(user["picture"] == picture, kept, "{picture}");
        assert_eq!(user["picture"].is_null(), !kept, "{picture}");
    }
}

#[tokio::test]
async fn failed_sign_in() {
    let provider = FakeProvider::start_with(axum::http::StatusCode::BAD_REQUEST, None).await;
    let app = TestApp::start_with(|settings| provider.configure(settings)).await;

    let response = sign_in(&app).await;
    assert_eq!(response.status, 400);
    assert_eq!(
        response.body["detail"],
        "Couldn't sign in with the provider"
    );
}

#[tokio::test]
async fn dev_sign_in_is_unavailable_with_oidc() {
    let (app, _provider) = accounts().await;
    assert_eq!(
        app.post("/api/auth/dev", ANONYMOUS, Value::Null)
            .await
            .status,
        404
    );
}

#[tokio::test]
async fn signing_in_after_deleting_starts_afresh() {
    let (app, provider) = accounts().await;
    let first = sign_in_as(&app, &provider, json!({"sub": "deleted"}))
        .await
        .body;
    let response = app
        .delete("/api/auth/me", first["token"].as_str().unwrap())
        .await;
    let again = sign_in_as(&app, &provider, json!({"sub": "deleted"}))
        .await
        .body;

    assert_eq!(response.status, 204);
    assert_ne!(again["user"]["id"], first["user"]["id"]);
    let listed = app
        .get("/api/deployments", again["token"].as_str().unwrap())
        .await;
    assert_eq!(listed.body, json!([]));
}

#[tokio::test]
async fn account_sites_count_toward_their_storage() {
    let provider = FakeProvider::start().await;
    let app = TestApp::start_with(|settings| {
        provider.configure(settings);
        settings.max_account_size = 1;
    })
    .await;
    let account = sign_in_as(&app, &provider, json!({"sub": "quota"}))
        .await
        .body["token"]
        .as_str()
        .unwrap()
        .to_string();
    publish(&app, &account).await;

    // Published sites take up room
    let response = app.post("/api/deployments", &account, manifest()).await;
    assert_eq!(response.status, 403);
}
