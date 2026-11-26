mod common;

use common::{ANONYMOUS, TestApp, unreachable};
use serde_json::json;

#[tokio::test]
async fn health_when_dependencies_are_available() {
    let app = TestApp::start().await;
    let response = app.get("/health", ANONYMOUS).await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({"status": "ok", "version": "dev"}));
}

#[tokio::test]
async fn health_when_s3_is_unavailable() {
    let app = TestApp::start_with(|settings| settings.s3_endpoint = unreachable()).await;
    let response = app.get("/health", ANONYMOUS).await;

    assert_eq!(response.status, 503);
    assert_eq!(
        response.body,
        json!({"status": "unavailable", "version": "dev"})
    );
}

#[tokio::test]
async fn version_without_signing_in() {
    let app = TestApp::start().await;
    let response = app.get("/api/version", ANONYMOUS).await;

    assert_eq!(response.body, json!({"version": "dev", "cli_sha256": null}));
}

#[tokio::test]
async fn version_vouches_for_the_cli() {
    let app = TestApp::start_with(|settings| settings.cli_sha256 = "ab".repeat(32)).await;
    let response = app.get("/api/version", ANONYMOUS).await;

    assert_eq!(response.body["cli_sha256"], "ab".repeat(32));
}
