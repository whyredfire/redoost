use std::env;

use anyhow::{Context, Result, bail};
use chrono::TimeDelta;
use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "provider", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Google,
}

/// The API's configuration, from REDOOST_* environment variables.
#[derive(Clone)]
pub struct Settings {
    /// Log verbosity, INFO or VERBOSE
    pub log_level: String,
    /// Frontend origin allowed to upload to S3
    pub app_origin: String,
    /// Version reported by /health
    pub version: String,
    /// Postgres database URL, postgres://user:password@host/db
    pub database_url: String,
    /// Key that signs the API's tokens
    pub jwt_secret: String,

    // Users sign in with an OIDC provider, or locally as a dev user
    pub oidc_issuer: Option<Url>,
    /// Who users sign in with, for the dashboard
    pub oidc_provider: Provider,
    pub oidc_client_id: Option<String>,
    pub oidc_client_secret: Option<String>,
    /// Let anyone sign in as a dev user, for development
    pub dev_sign_in: bool,

    /// S3 endpoint used by the backend
    pub s3_endpoint: Url,
    /// S3 endpoint used by browsers for uploads
    pub s3_public_endpoint: Url,
    /// S3 region used for signing
    pub s3_region: String,
    /// Bucket that stores deployments
    pub s3_bucket: String,
    pub s3_access_key_id: String,
    pub s3_secret_access_key: String,

    /// Maximum size of one file, in bytes
    pub max_file_size: u64,
    /// Maximum size of a deployment, in bytes
    pub max_deployment_size: u64,
    /// Maximum number of files in a deployment
    pub max_deployment_files: usize,
    /// Maximum total size of a user's sites, in bytes
    pub max_account_size: u64,
    /// Versions each site keeps, counting the one being served
    pub kept_versions: usize,
    /// How long upload policies stay valid
    pub upload_window: TimeDelta,
}

// Shows no values, as some are secrets
impl std::fmt::Debug for Settings {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Settings").finish_non_exhaustive()
    }
}

impl Settings {
    pub fn from_env() -> Result<Settings> {
        let settings = Settings {
            log_level: required("LOG_LEVEL")?,
            app_origin: required("APP_ORIGIN")?,
            version: optional("VERSION").unwrap_or_else(|| "dev".into()),
            database_url: database_url(&required("DATABASE_URL")?)?,
            jwt_secret: required("JWT_SECRET")?,
            oidc_issuer: optional("OIDC_ISSUER")
                .map(|value| http_url("OIDC_ISSUER", &value))
                .transpose()?,
            oidc_provider: match optional("OIDC_PROVIDER").as_deref() {
                None | Some("google") => Provider::Google,
                Some(other) => bail!("REDOOST_OIDC_PROVIDER must be google, not {other}"),
            },
            oidc_client_id: optional("OIDC_CLIENT_ID"),
            oidc_client_secret: optional("OIDC_CLIENT_SECRET"),
            dev_sign_in: parse("DEV_SIGN_IN", false, boolean)?,
            s3_endpoint: http_url("S3_ENDPOINT", &required("S3_ENDPOINT")?)?,
            s3_public_endpoint: http_url("S3_PUBLIC_ENDPOINT", &required("S3_PUBLIC_ENDPOINT")?)?,
            s3_region: required("S3_REGION")?,
            s3_bucket: required("S3_BUCKET")?,
            s3_access_key_id: required("S3_ACCESS_KEY_ID")?,
            s3_secret_access_key: required("S3_SECRET_ACCESS_KEY")?,
            max_file_size: parse("MAX_FILE_SIZE", 20 * MIB, byte_size)?,
            max_deployment_size: parse("MAX_DEPLOYMENT_SIZE", 150 * MIB, byte_size)?,
            max_deployment_files: parse("MAX_DEPLOYMENT_FILES", 2000, |value| Ok(value.parse()?))?,
            max_account_size: parse("MAX_ACCOUNT_SIZE", 500 * MIB, byte_size)?,
            kept_versions: parse("KEPT_VERSIONS", 5, |value| Ok(value.parse()?))?,
            upload_window: parse("UPLOAD_WINDOW", TimeDelta::hours(1), duration)?,
        };
        settings.validate()?;
        Ok(settings)
    }

    fn validate(&self) -> Result<()> {
        if !["INFO", "VERBOSE"].contains(&self.log_level.as_str()) {
            bail!("REDOOST_LOG_LEVEL must be INFO or VERBOSE");
        }
        if self.jwt_secret.chars().count() < 32 {
            bail!("REDOOST_JWT_SECRET must be at least 32 characters");
        }
        if self.kept_versions < 1 {
            bail!("REDOOST_KEPT_VERSIONS must be at least 1");
        }
        // Garage rejects POST policies signed more than 24 hours ago
        if self.upload_window > TimeDelta::hours(24) {
            bail!("REDOOST_UPLOAD_WINDOW can be at most 24 hours");
        }
        if self.oidc_issuer.is_some()
            && (self.oidc_client_id.is_none() || self.oidc_client_secret.is_none())
        {
            bail!("OIDC needs a client ID and secret");
        }
        if self.oidc_issuer.is_some() == self.dev_sign_in {
            bail!("Set either an OIDC issuer or dev sign-in, not both");
        }
        Ok(())
    }
}

const MIB: u64 = 1024 * 1024;

/// An unset or empty variable counts as missing.
fn optional(name: &str) -> Option<String> {
    env::var(format!("REDOOST_{name}"))
        .ok()
        .filter(|value| !value.is_empty())
}

fn required(name: &str) -> Result<String> {
    optional(name).with_context(|| format!("REDOOST_{name} is required"))
}

fn parse<T>(name: &str, default: T, parser: impl Fn(&str) -> Result<T>) -> Result<T> {
    match optional(name) {
        None => Ok(default),
        Some(value) => {
            parser(value.trim()).with_context(|| format!("Invalid REDOOST_{name}: {value}"))
        }
    }
}

// Existing deployments name the Python driver, as postgresql+asyncpg://
fn database_url(url: &str) -> Result<String> {
    if let Some(rest) = url.strip_prefix("postgresql+asyncpg://") {
        return Ok(format!("postgresql://{rest}"));
    }
    if !url.starts_with("postgres://") && !url.starts_with("postgresql://") {
        bail!("REDOOST_DATABASE_URL must be a postgres:// URL");
    }
    Ok(url.to_owned())
}

fn http_url(name: &str, value: &str) -> Result<Url> {
    let url = Url::parse(value).with_context(|| format!("Invalid REDOOST_{name}: {value}"))?;
    if !["http", "https"].contains(&url.scheme()) || !url.has_host() {
        bail!("REDOOST_{name} must be an http(s) URL");
    }
    Ok(url)
}

fn boolean(value: &str) -> Result<bool> {
    match value.to_lowercase().as_str() {
        "1" | "on" | "t" | "true" | "y" | "yes" => Ok(true),
        "0" | "off" | "f" | "false" | "n" | "no" => Ok(false),
        _ => bail!("not a boolean"),
    }
}

/// A size in bytes, like 1048576, 20MiB, or 1.5 GB.
pub fn byte_size(value: &str) -> Result<u64> {
    let split = value
        .find(|c: char| !c.is_ascii_digit() && c != '.')
        .unwrap_or(value.len());
    let (number, unit) = value.split_at(split);
    let number: f64 = number.parse()?;
    let multiplier: u64 = match unit.trim().to_lowercase().as_str() {
        "" | "b" => 1,
        "k" | "kb" => 1000,
        "m" | "mb" => 1000_u64.pow(2),
        "g" | "gb" => 1000_u64.pow(3),
        "t" | "tb" => 1000_u64.pow(4),
        "p" | "pb" => 1000_u64.pow(5),
        "e" | "eb" => 1000_u64.pow(6),
        "kib" => 1 << 10,
        "mib" => 1 << 20,
        "gib" => 1 << 30,
        "tib" => 1 << 40,
        "pib" => 1 << 50,
        "eib" => 1 << 60,
        other => bail!("unknown unit {other}"),
    };
    Ok((number * multiplier as f64) as u64)
}

/// A size the way people read it, like 500.0MiB, as pydantic's ByteSize writes it.
pub fn human_readable(size: u64) -> String {
    let mut number = size as f64;
    for unit in ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] {
        if number < 1024.0 {
            return match unit {
                "B" => format!("{number:.0}{unit}"),
                _ => format!("{number:.1}{unit}"),
            };
        }
        number /= 1024.0;
    }
    format!("{number:.1}EiB")
}

/// A duration in seconds, like 3600, or in ISO 8601, like PT1H or P1DT2H30M.
pub fn duration(value: &str) -> Result<TimeDelta> {
    if let Ok(seconds) = value.parse::<f64>() {
        return Ok(TimeDelta::microseconds((seconds * 1e6) as i64));
    }
    let (negative, value) = match value.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, value),
    };
    let Some(value) = value.strip_prefix('P') else {
        bail!("not a number of seconds or an ISO 8601 duration");
    };
    let mut seconds = 0.0;
    let mut in_time = false;
    let mut number = String::new();
    for c in value.chars() {
        let unit = match (c, in_time) {
            ('T', false) => {
                in_time = true;
                continue;
            }
            ('0'..='9' | '.', _) => {
                number.push(c);
                continue;
            }
            ('W', false) => 604800.0,
            ('D', false) => 86400.0,
            ('H', true) => 3600.0,
            ('M', true) => 60.0,
            ('S', true) => 1.0,
            _ => bail!("unexpected {c} in ISO 8601 duration"),
        };
        seconds += number.parse::<f64>()? * unit;
        number.clear();
    }
    if !number.is_empty() {
        bail!("ISO 8601 duration ends without a unit");
    }
    let duration = TimeDelta::microseconds((seconds * 1e6) as i64);
    Ok(if negative { -duration } else { duration })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_sizes() {
        assert_eq!(byte_size("20MiB").unwrap(), 20 * MIB);
        assert_eq!(byte_size("1048576").unwrap(), MIB);
        assert_eq!(byte_size("1.5 kb").unwrap(), 1500);
        assert!(byte_size("lots").is_err());
    }

    #[test]
    fn writes_sizes_like_pydantic() {
        assert_eq!(human_readable(1), "1B");
        assert_eq!(human_readable(500 * MIB), "500.0MiB");
        assert_eq!(human_readable(1536), "1.5KiB");
    }

    #[test]
    fn reads_durations() {
        assert_eq!(duration("PT1H").unwrap(), TimeDelta::hours(1));
        assert_eq!(duration("P1DT2H30M").unwrap(), TimeDelta::minutes(1590));
        assert_eq!(duration("3600").unwrap(), TimeDelta::hours(1));
        assert_eq!(duration("-1").unwrap(), TimeDelta::seconds(-1));
        assert!(duration("PT1").is_err());
        assert!(duration("1H").is_err());
    }
}
