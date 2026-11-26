mod common;

use axum::http::StatusCode;
use common::{ANONYMOUS, FakeProvider, TestApp, sign_in, unreachable};
use serde_json::json;

#[tokio::test]
async fn reads_the_user_behind_a_code() {
    let provider = FakeProvider::start().await;
    let app = TestApp::start_with(|settings| provider.configure(settings)).await;

    let config = app.get("/api/auth/config", ANONYMOUS).await;
    let response = sign_in(&app).await;

    assert_eq!(
        config.body["oidc"]["authorization_endpoint"],
        format!("{}/authorize", provider.base)
    );
    assert_eq!(response.status, 200);
    let user = &response.body["user"];
    assert_eq!(
        (&user["email"], &user["name"]),
        (&json!("ada@example.com"), &json!("Ada Lovelace"))
    );
    // The provider's configuration is read once
    assert_eq!(provider.requests(), ["configuration", "token", "userinfo"]);
}

#[tokio::test]
async fn rejected_codes_fail_the_sign_in() {
    let provider = FakeProvider::start_with(StatusCode::BAD_REQUEST, None).await;
    let app = TestApp::start_with(|settings| provider.configure(settings)).await;

    let response = sign_in(&app).await;

    assert_eq!(response.status, 400);
    assert_eq!(
        response.body["detail"],
        "Couldn't sign in with the provider"
    );
    assert!(!provider.requests().contains(&"userinfo"));
}

#[tokio::test]
async fn malformed_configuration_fails() {
    let provider = FakeProvider::start_with(StatusCode::OK, Some("<html>not json</html>")).await;
    let app = TestApp::start_with(|settings| provider.configure(settings)).await;

    let response = app.get("/api/auth/config", ANONYMOUS).await;

    assert_eq!(response.status, 502);
    assert_eq!(
        response.body["detail"],
        "Couldn't read the provider's configuration"
    );
}

#[tokio::test]
async fn unreachable_providers_fail() {
    let provider = FakeProvider::start().await;
    let app = TestApp::start_with(|settings| {
        provider.configure(settings);
        settings.oidc_issuer = Some(unreachable());
    })
    .await;

    assert_eq!(app.get("/api/auth/config", ANONYMOUS).await.status, 502);
    assert_eq!(sign_in(&app).await.status, 400);
}
