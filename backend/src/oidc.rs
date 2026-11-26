use std::time::Duration;

use anyhow::{Context, Result};
use serde::Deserialize;

use crate::AppState;

pub const SCOPE: &str = "openid email profile";

#[derive(Debug)]
pub struct OidcError(pub &'static str);

#[derive(Clone, Deserialize)]
pub struct OidcMetadata {
    /// Where sign-in starts
    pub authorization_endpoint: String,
    /// Where codes are exchanged
    pub token_endpoint: String,
    /// Where the user is read from
    pub userinfo_endpoint: String,
}

#[derive(Debug, PartialEq, Deserialize)]
pub struct UserInfo {
    /// The provider's stable ID for the user
    pub sub: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub picture: Option<String>,
}

impl UserInfo {
    // Shown as an image, so only addresses a browser fetches over TLS are kept
    fn keep_secure_picture(mut self) -> UserInfo {
        self.picture = self
            .picture
            .filter(|picture| picture.starts_with("https://"));
        self
    }
}

fn client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()?)
}

/// The provider's configuration, read once and kept for the life of the API.
async fn discover(state: &AppState, http: &reqwest::Client) -> Result<OidcMetadata> {
    let metadata = state.oidc_metadata.get_or_try_init(|| async {
        let issuer = state
            .settings
            .oidc_issuer
            .as_ref()
            .context("No OIDC issuer")?;
        let url = format!(
            "{}/.well-known/openid-configuration",
            issuer.as_str().trim_end_matches('/')
        );
        let response = http.get(url).send().await?.error_for_status()?;
        anyhow::Ok(response.json::<OidcMetadata>().await?)
    });
    Ok(metadata.await?.clone())
}

pub async fn read_metadata(state: &AppState) -> Result<OidcMetadata, OidcError> {
    let metadata = async { discover(state, &client()?).await };
    metadata
        .await
        .map_err(|_| OidcError("Couldn't read the provider's configuration"))
}

// Tokens from the provider over TLS are trusted unsigned (OIDC Core 3.1.3.7)
pub async fn read_userinfo(
    state: &AppState,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<UserInfo, OidcError> {
    let settings = &state.settings;
    let info = async {
        let http = client()?;
        let metadata = discover(state, &http).await?;
        let form = [
            ("grant_type", "authorization_code"),
            ("code", code),
            ("code_verifier", code_verifier),
            ("redirect_uri", redirect_uri),
        ];
        let response = http
            .post(&metadata.token_endpoint)
            .form(&form)
            .basic_auth(
                settings.oidc_client_id.as_deref().unwrap_or_default(),
                settings.oidc_client_secret.as_deref(),
            )
            .send()
            .await?
            .error_for_status()?;
        let tokens: serde_json::Value = response.json().await?;
        let access_token = tokens["access_token"].as_str().context("No access token")?;
        let response = http
            .get(&metadata.userinfo_endpoint)
            .bearer_auth(access_token)
            .send()
            .await?
            .error_for_status()?;
        anyhow::Ok(response.json::<UserInfo>().await?)
    };
    match info.await {
        Ok(info) => Ok(info.keep_secure_picture()),
        Err(_) => Err(OidcError("Couldn't sign in with the provider")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_secure_pictures() {
        let picture = |url: &str| {
            let info = UserInfo {
                sub: "subject".into(),
                email: None,
                name: None,
                picture: Some(url.into()),
            };
            info.keep_secure_picture().picture
        };
        assert!(picture("https://lh3.googleusercontent.com/a/ada").is_some());
        assert!(picture("http://example.com/ada.png").is_none());
        assert!(picture("javascript:alert(1)").is_none());
    }
}
