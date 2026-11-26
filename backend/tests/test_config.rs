mod common;

use chrono::TimeDelta;
use common::{remove_env, serial, set_env};
use redoost_api::config::Settings;

/// Reads settings with these variables set, or removed when None, then puts the
/// environment back.
fn settings_with(vars: &[(&str, Option<&str>)]) -> anyhow::Result<Settings> {
    let before: Vec<_> = vars
        .iter()
        .map(|(name, _)| (*name, std::env::var(name).ok()))
        .collect();
    for (name, value) in vars {
        match value {
            Some(value) => set_env(name, value),
            None => remove_env(name),
        }
    }
    let settings = Settings::from_env();
    for (name, value) in before {
        match value {
            Some(value) => set_env(name, &value),
            None => remove_env(name),
        }
    }
    settings
}

#[tokio::test]
async fn database_must_be_postgres() {
    let _serial = serial().await;
    for url in [
        None,
        Some("sqlite+aiosqlite:///./redoost.db"),
        Some("mysql://host/redoost"),
    ] {
        assert!(
            settings_with(&[("REDOOST_DATABASE_URL", url)]).is_err(),
            "{url:?}"
        );
    }
}

#[tokio::test]
async fn database_urls_from_the_python_release_keep_working() {
    let _serial = serial().await;
    for url in [
        "postgresql+asyncpg://user:password@host/redoost",
        "postgresql://user:password@host/redoost",
        "postgres://user:password@host/redoost",
    ] {
        let settings = settings_with(&[("REDOOST_DATABASE_URL", Some(url))]).unwrap();
        assert!(!settings.database_url.contains("+asyncpg"), "{url}");
        assert!(
            settings
                .database_url
                .ends_with("user:password@host/redoost"),
            "{url}"
        );
    }
}

#[tokio::test]
async fn settings_load_prefixed_environment() {
    let _serial = serial().await;
    let settings = settings_with(&[
        ("REDOOST_S3_BUCKET", Some("test-sites")),
        ("REDOOST_LOG_LEVEL", Some("VERBOSE")),
    ])
    .unwrap();

    assert_eq!(settings.s3_bucket, "test-sites");
    assert_eq!(settings.log_level, "VERBOSE");
}

#[tokio::test]
async fn internal_and_public_storage_endpoints_are_distinct_settings() {
    let _serial = serial().await;
    let settings = settings_with(&[
        ("REDOOST_S3_ENDPOINT", Some("http://garage:3900")),
        (
            "REDOOST_S3_PUBLIC_ENDPOINT",
            Some("https://uploads.example.com"),
        ),
    ])
    .unwrap();

    assert_eq!(
        settings.s3_endpoint.as_str().trim_end_matches('/'),
        "http://garage:3900"
    );
    assert_eq!(
        settings.s3_public_endpoint.as_str().trim_end_matches('/'),
        "https://uploads.example.com"
    );
}

#[tokio::test]
async fn sizes_take_bytes_or_units() {
    let _serial = serial().await;
    for size in ["20MiB", "20971520"] {
        let settings = settings_with(&[("REDOOST_MAX_FILE_SIZE", Some(size))]).unwrap();
        assert_eq!(settings.max_file_size, 20 * 1024 * 1024, "{size}");
    }
}

#[tokio::test]
async fn upload_window_takes_iso_durations_or_seconds() {
    let _serial = serial().await;
    for (window, seconds) in [("PT1H", 3600), ("PT30M", 1800), ("90", 90)] {
        let settings = settings_with(&[("REDOOST_UPLOAD_WINDOW", Some(window))]).unwrap();
        assert_eq!(
            settings.upload_window,
            TimeDelta::seconds(seconds),
            "{window}"
        );
    }
}

#[tokio::test]
async fn upload_window_is_capped_at_24_hours() {
    let _serial = serial().await;
    assert!(settings_with(&[("REDOOST_UPLOAD_WINDOW", Some("PT25H"))]).is_err());
}

#[tokio::test]
async fn sign_in_needs_exactly_one_method() {
    let _serial = serial().await;
    let neither = settings_with(&[("REDOOST_DEV_SIGN_IN", Some("false"))]);
    let both = settings_with(&[
        ("REDOOST_DEV_SIGN_IN", Some("true")),
        ("REDOOST_OIDC_ISSUER", Some("https://accounts.google.com")),
        ("REDOOST_OIDC_CLIENT_ID", Some("redoost")),
        ("REDOOST_OIDC_CLIENT_SECRET", Some("secret")),
    ]);

    for settings in [neither, both] {
        let error = settings.unwrap_err().to_string();
        assert!(
            error.contains("either an OIDC issuer or dev sign-in"),
            "{error}"
        );
    }
}
