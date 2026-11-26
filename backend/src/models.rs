use std::collections::{BTreeMap, HashSet};
use std::sync::LazyLock;

use chrono::{DateTime, NaiveDateTime, SubsecRound, Utc};
use petname::Petnames;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::json;
use sqlx::types::Json;

use crate::config::{Provider, Settings, human_readable};
use crate::error::{ApiError, ApiResult};

/// Now, to the microsecond Postgres keeps, so times read the same before and after
/// they're stored.
pub fn now() -> DateTime<Utc> {
    Utc::now().trunc_subsecs(6)
}

pub fn random_hex(bytes: usize) -> String {
    let mut buffer = vec![0; bytes];
    rand::fill(&mut buffer[..]);
    hex::encode(buffer)
}

// Each publish or update uploads into its own folder, like brave-otter-1a2b/v-0123456789ab/,
// so a site switches to it in one step. Sites from before versions keep their files at
// the slug's root, next to their newer versions' folders.
pub fn starts_with_version_folder(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 15
        && path.starts_with("v-")
        && bytes[2..14]
            .iter()
            .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
        && bytes[14] == b'/'
}

// Slugs go in URLs and Nginx's patterns, so only plain lowercase words make it in
static PETNAMES: LazyLock<Petnames<'static>> = LazyLock::new(|| {
    let mut petnames = Petnames::default();
    petnames.retain(|word| !word.is_empty() && word.bytes().all(|b| b.is_ascii_lowercase()));
    petnames
});

pub fn new_slug() -> String {
    let words = PETNAMES
        .namer(2, "-")
        .iter(&mut rand::rng())
        .next()
        .expect("word lists are empty");
    format!("{words}-{}", random_hex(2))
}

/// The shape Nginx takes slugs in: two or more words and a hex tail, like brave-otter-1a2b.
pub fn is_slug(slug: &str) -> bool {
    let parts: Vec<&str> = slug.split('-').collect();
    let Some((tail, words)) = parts.split_last() else {
        return false;
    };
    slug.len() <= 63
        && words.len() >= 2
        && words
            .iter()
            .all(|word| !word.is_empty() && word.bytes().all(|b| b.is_ascii_lowercase()))
        && tail.len() == 4
        && tail.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, sqlx::Type)]
#[sqlx(type_name = "deploymentstate", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum DeploymentState {
    Uploading,
    Ready,
}

/// A site. Serialized without what only the API needs to know.
#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
pub struct Deployment {
    /// Site subdomain
    pub slug: String,
    pub state: DeploymentState,
    /// Number of files in the manifest
    pub file_count: i32,
    /// Total manifest size in bytes
    pub total_size: i64,
    /// Bytes all the site's kept versions take up
    pub storage_size: i64,
    /// Versions kept, counting the one being served
    pub version_count: i32,
    /// Serve index.html for missing pages (no 404.html)
    pub spa: bool,
    /// Whether visitors can reach the site
    pub enabled: bool,
    /// Note to tell the site apart
    pub description: String,
    pub created_at: DateTime<Utc>,
    /// When the site goes offline, if ever
    pub expires_at: Option<DateTime<Utc>>,
    /// Until when the latest upload holds the site; its policies expire then
    pub locked_until: DateTime<Utc>,
    #[serde(skip)]
    pub owner_id: String,
    /// Storage prefix of the files being served
    #[serde(skip)]
    pub folder: Option<String>,
    /// Storage prefix the current upload goes to
    #[serde(skip)]
    pub pending_folder: Option<String>,
    /// Bytes an update uploads next to the files being served
    #[serde(skip)]
    pub pending_size: i64,
    /// SHA-256 of the manifest the current upload was signed for, so completing it
    /// can't publish other files
    #[serde(skip)]
    pub pending_digest: Option<String>,
}

/// A file as a version recorded it when it was published.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StoredObject {
    pub sha256: Option<String>,
    /// The bytes actually stored, which a manifest can't vouch for
    pub size: i64,
    /// Of the file before compression, on its client's word
    #[serde(default)]
    pub original_sha256: Option<String>,
}

/// A published version of a site, kept so an update can be undone.
///
/// Its files are recorded as verified when it was published, so updates and their
/// checks never read them back from storage.
#[derive(Clone, Debug, sqlx::FromRow)]
pub struct Version {
    pub folder: String,
    pub slug: String,
    pub created_at: DateTime<Utc>,
    /// When it stopped being served, if it has
    pub retired_at: Option<DateTime<Utc>>,
    pub file_count: i32,
    pub size: i64,
    pub spa: bool,
    pub description: String,
    pub files: Json<BTreeMap<String, StoredObject>>,
}

impl Version {
    /// The folder's name inside the site, like v-0123456789ab.
    pub fn id(&self) -> &str {
        let id = self
            .folder
            .strip_prefix(&format!("{}/", self.slug))
            .unwrap_or(&self.folder);
        id.strip_suffix('/').unwrap_or(id)
    }
}

#[derive(Serialize)]
pub struct VersionInfo {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub file_count: i32,
    pub size: i64,
    pub description: String,
    /// Whether visitors see this version
    pub current: bool,
}

impl VersionInfo {
    pub fn new(version: &Version, deployment: &Deployment) -> VersionInfo {
        VersionInfo {
            id: version.id().to_owned(),
            created_at: version.created_at,
            file_count: version.file_count,
            size: version.size,
            description: version.description.clone(),
            current: Some(&version.folder) == deployment.folder.as_ref(),
        }
    }
}

#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
pub struct User {
    pub id: String,
    /// Who the user signs in with
    pub provider: Provider,
    pub email: Option<String>,
    pub name: Option<String>,
    /// Profile picture URL from the provider
    pub picture: Option<String>,
    /// The provider's stable ID for the user; emails can change, so users are found by this
    #[serde(skip)]
    pub subject: String,
    #[serde(skip)]
    pub created_at: DateTime<Utc>,
}

/// What a token may do. Reading comes with every scope.
///
/// - read: list the user's sites, their files, and their storage use
/// - publish: create sites and update them, completing or cancelling the upload
/// - manage: take sites offline or online, describe them, and delete them
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    Read,
    Publish,
    Manage,
}

impl Scope {
    pub const ALL: [Scope; 3] = [Scope::Read, Scope::Publish, Scope::Manage];

    pub fn name(self) -> &'static str {
        match self {
            Scope::Read => "read",
            Scope::Publish => "publish",
            Scope::Manage => "manage",
        }
    }
}

/// How a token was made.
///
/// - cli: by redoost login, named after the machine, with every scope for 30 days
/// - manual: in the dashboard's settings, with chosen scopes and expiry
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, sqlx::Type)]
#[sqlx(type_name = "tokensource", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum TokenSource {
    Cli,
    Manual,
}

/// Acts as its user: made by redoost login, or by hand for pipelines. Serialized
/// without its hash.
#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
pub struct ApiToken {
    pub id: String,
    /// What the token is for
    pub name: String,
    #[serde(skip)]
    pub secret_hash: String,
    #[serde(skip)]
    pub user_id: String,
    pub source: TokenSource,
    pub scopes: Json<Vec<Scope>>,
    pub created_at: DateTime<Utc>,
    /// When it last authenticated a request
    pub last_used_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
}

// Request bodies. They're checked by hand after parsing, with messages like
// pydantic's, which is what clients show.

#[derive(Deserialize)]
pub struct ManifestFile {
    /// Path relative to the site root
    pub path: String,
    /// File size in bytes
    pub size: i64,
    /// Base64-encoded SHA-256 digest
    pub sha256: String,
    /// Uploaded gzip-compressed, so it's served with Content-Encoding: gzip
    #[serde(default)]
    pub gzip: bool,
    /// Base64-encoded SHA-256 digest before compression, which tells whether a file
    /// changed however its client compressed it
    #[serde(default)]
    pub original_sha256: Option<String>,
}

#[derive(Deserialize)]
pub struct Manifest {
    /// Files to upload, including a root index.html
    pub files: Vec<ManifestFile>,
    /// Note to tell the site apart; kept as it is when missing
    #[serde(default)]
    pub description: Option<String>,
    /// What this version changes, shown with it
    #[serde(default)]
    pub version_description: Option<String>,
    /// When the site goes offline; a new site never does without it, and an update
    /// keeps it as it is
    #[serde(default, deserialize_with = "datetime")]
    pub expires_at: Option<DateTime<Utc>>,
    /// Subdomain to publish a new site at, from those GET /api/deployments/slugs
    /// offered; picked when missing, and ignored by updates
    #[serde(default)]
    pub slug: Option<String>,
}

impl Manifest {
    pub fn validate(&mut self, settings: &Settings) -> ApiResult<()> {
        let count = self.files.len();
        if count == 0 {
            return Err(ApiError::invalid(
                json!(["body", "files"]),
                "List should have at least 1 item after validation, not 0",
            ));
        }
        if count > settings.max_deployment_files {
            return Err(ApiError::invalid(
                json!(["body", "files"]),
                format!(
                    "List should have at most {} items after validation, not {count}",
                    settings.max_deployment_files
                ),
            ));
        }
        for (index, file) in self.files.iter_mut().enumerate() {
            file.validate(settings).map_err(|(field, msg)| {
                ApiError::invalid(json!(["body", "files", index, field]), msg)
            })?;
        }
        self.description = description(self.description.take(), "description")?;
        self.version_description =
            description(self.version_description.take(), "version_description")?;
        ahead(self.expires_at, "expires_at")?;

        let paths: HashSet<&str> = self.files.iter().map(|file| file.path.as_str()).collect();
        if paths.len() != count {
            return Err(ApiError::invalid(
                json!(["body"]),
                "Value error, Duplicate file paths",
            ));
        }
        if !paths.contains("index.html") {
            return Err(ApiError::invalid(
                json!(["body"]),
                "Value error, A root index.html is required",
            ));
        }
        if self.total_size() > settings.max_deployment_size as i64 {
            let limit = human_readable(settings.max_deployment_size);
            return Err(ApiError::invalid(
                json!(["body"]),
                format!("Value error, Deployment exceeds {limit}"),
            ));
        }
        Ok(())
    }

    pub fn total_size(&self) -> i64 {
        self.files.iter().map(|file| file.size).sum()
    }

    /// Serve index.html for missing pages, unless the site has its own 404 page.
    pub fn spa(&self) -> bool {
        self.files.iter().all(|file| file.path != "404.html")
    }
}

impl ManifestFile {
    /// Checks the file, saying which field is wrong and how.
    fn validate(&mut self, settings: &Settings) -> Result<(), (&'static str, String)> {
        validate_path(&self.path).map_err(|msg| ("path", format!("Value error, {msg}")))?;
        if self.size < 0 {
            return Err(("size", "Input should be greater than or equal to 0".into()));
        }
        if self.size as u64 > settings.max_file_size {
            return Err((
                "size",
                format!(
                    "Input should be less than or equal to {}",
                    settings.max_file_size
                ),
            ));
        }
        if !is_sha256(&self.sha256) {
            return Err(("sha256", SHA256_PATTERN.into()));
        }
        if self
            .original_sha256
            .as_deref()
            .is_some_and(|digest| !is_sha256(digest))
        {
            return Err(("original_sha256", SHA256_PATTERN.into()));
        }
        // Files sent as they are hash the same before compression
        if !self.gzip {
            self.original_sha256 = Some(self.sha256.clone());
        }
        Ok(())
    }
}

const SHA256_PATTERN: &str = "String should match pattern '^[A-Za-z0-9+/]{43}=$'";

/// A base64-encoded SHA-256 digest, as S3 takes it.
fn is_sha256(digest: &str) -> bool {
    digest.len() == 44
        && digest.ends_with('=')
        && digest[..43]
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/')
}

fn validate_path(path: &str) -> Result<(), &'static str> {
    if path.len() > 900
        || path.contains('\\')
        || !path.chars().all(printable)
        || path.split('/').any(|part| ["", ".", ".."].contains(&part))
    {
        return Err(
            "Must be a relative path of at most 900 bytes without empty, '.' or '..' segments",
        );
    }
    // Version folders go inside a site's root, where these would be mistaken for one
    if starts_with_version_folder(path) {
        return Err("Can't start with a folder named like v-0123456789ab");
    }
    Ok(())
}

/// Like Python's str.isprintable: no control characters, invisible formatting, or
/// separators other than a space.
fn printable(c: char) -> bool {
    !(c.is_control()
        || (c.is_whitespace() && c != ' ')
        || matches!(c, '\u{ad}' | '\u{200b}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2060}'..='\u{2064}' | '\u{feff}'))
}

/// A note to tell sites or versions apart, short enough to show in a list next to
/// the site's address.
fn description(value: Option<String>, field: &str) -> ApiResult<Option<String>> {
    let Some(value) = value else { return Ok(None) };
    let value = value.trim().to_owned();
    if value.chars().count() > 200 {
        return Err(ApiError::invalid(
            json!(["body", field]),
            "String should have at most 200 characters",
        ));
    }
    Ok(Some(value))
}

/// A token's name, like GitHub Actions.
fn token_name(value: &str) -> ApiResult<String> {
    let value = value.trim();
    match value.chars().count() {
        0 => Err(ApiError::invalid(
            json!(["body", "name"]),
            "String should have at least 1 character",
        )),
        101.. => Err(ApiError::invalid(
            json!(["body", "name"]),
            "String should have at most 100 characters",
        )),
        _ => Ok(value.to_owned()),
    }
}

/// Expiries are set to a time still to come.
fn ahead(moment: Option<DateTime<Utc>>, field: &str) -> ApiResult<()> {
    if moment.is_some_and(|moment| moment <= Utc::now()) {
        return Err(ApiError::invalid(
            json!(["body", field]),
            "Value error, Must be in the future",
        ));
    }
    Ok(())
}

/// An RFC 3339 time; one without an offset is in UTC.
fn datetime<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<DateTime<Utc>>, D::Error> {
    let Some(text) = Option::<String>::deserialize(deserializer)? else {
        return Ok(None);
    };
    DateTime::parse_from_rfc3339(&text)
        .map(|moment| moment.to_utc())
        .or_else(|_| {
            NaiveDateTime::parse_from_str(&text, "%Y-%m-%dT%H:%M:%S%.f")
                .map(|moment| moment.and_utc())
        })
        .map(|moment| Some(moment.trunc_subsecs(6)))
        .map_err(|_| {
            serde::de::Error::custom(format!("Input should be a valid datetime, not {text}"))
        })
}

/// Tells a field set to null from a missing one, which is None.
fn present<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Option<DateTime<Utc>>>, D::Error> {
    datetime(deserializer).map(Some)
}

#[derive(Deserialize)]
pub struct DeploymentChange {
    pub enabled: Option<bool>,
    pub description: Option<String>,
    /// When the site goes offline; null for never, and left alone when missing
    #[serde(default, deserialize_with = "present")]
    pub expires_at: Option<Option<DateTime<Utc>>>,
}

impl DeploymentChange {
    pub fn validate(&mut self) -> ApiResult<()> {
        self.description = description(self.description.take(), "description")?;
        ahead(self.expires_at.flatten(), "expires_at")
    }
}

#[derive(Deserialize)]
pub struct VersionChange {
    pub description: String,
}

impl VersionChange {
    pub fn validate(&mut self) -> ApiResult<()> {
        self.description = description(Some(std::mem::take(&mut self.description)), "description")?
            .unwrap_or_default();
        Ok(())
    }
}

#[derive(Deserialize)]
pub struct SitesChange {
    pub enabled: bool,
}

#[derive(Deserialize)]
pub struct ApiTokenCreate {
    pub name: String,
    pub scopes: Vec<Scope>,
    #[serde(default, deserialize_with = "datetime")]
    pub expires_at: Option<DateTime<Utc>>,
}

impl ApiTokenCreate {
    pub fn validate(&mut self) -> ApiResult<()> {
        self.name = token_name(&self.name)?;
        if self.scopes.is_empty() {
            return Err(ApiError::invalid(
                json!(["body", "scopes"]),
                "List should have at least 1 item after validation, not 0",
            ));
        }
        // Repeats are dropped, keeping the order they came in
        let mut seen = HashSet::new();
        self.scopes.retain(|scope| seen.insert(*scope));
        ahead(self.expires_at, "expires_at")
    }
}

#[derive(Deserialize)]
pub struct CliLoginClaim {
    /// Secret from starting the sign-in
    pub secret: String,
    /// Where the CLI runs, to tell its token apart
    #[serde(default = "cli_token_name")]
    pub name: String,
}

fn cli_token_name() -> String {
    "CLI".into()
}

impl CliLoginClaim {
    pub fn validate(&mut self) -> ApiResult<()> {
        self.name = token_name(&self.name)?;
        Ok(())
    }
}

#[derive(Deserialize)]
pub struct SignIn {
    /// Authorization code from the provider
    pub code: String,
    /// PKCE verifier the code was requested with
    pub code_verifier: String,
    /// Redirect URI the code was requested with
    pub redirect_uri: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs_have_words_and_a_hex_tail() {
        for _ in 0..100 {
            let slug = new_slug();
            assert!(is_slug(&slug), "{slug}");
        }
        for slug in [
            "Brave-Otter-1a2b",
            "otter-1a2b",
            "brave-otter",
            "brave-otter-1a2b/",
            "",
            "brave--otter-1a2b",
        ] {
            assert!(!is_slug(slug), "{slug}");
        }
        assert!(is_slug("very-brave-otter-1a2b"));
    }

    #[test]
    fn spots_version_folders() {
        assert!(starts_with_version_folder("v-0123456789ab/index.html"));
        assert!(!starts_with_version_folder("v-0123456789ab"));
        assert!(!starts_with_version_folder("v-0123456789AB/index.html"));
        assert!(!starts_with_version_folder(
            "docs/v-0123456789ab/index.html"
        ));
    }

    #[test]
    fn checks_paths() {
        for path in [
            "index.html",
            ".well-known/security.txt",
            "docs/café menu.html",
        ] {
            assert!(validate_path(path).is_ok(), "{path}");
        }
        let long = "x".repeat(901);
        for path in [
            "/index.html",
            "../index.html",
            "a/../b",
            "./a",
            "a//b",
            "a/",
            "a\\b",
            "a\nb",
            &long,
            "v-0123456789ab/blob",
        ] {
            assert!(validate_path(path).is_err(), "{path}");
        }
    }
}
