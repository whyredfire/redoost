from datetime import timedelta
from enum import StrEnum
from typing import Literal, Self

from pydantic import AnyHttpUrl, ByteSize, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Provider(StrEnum):
    google = "google"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="REDOOST_", extra="ignore")

    log_level: Literal["INFO", "VERBOSE"] = Field(description="Log verbosity")
    app_origin: str = Field(description="Frontend origin allowed to upload to S3")
    reload: bool = Field(default=False, description="Reload the API on code changes")
    version: str = Field(default="dev", description="Version reported by /health")
    database_url: str = Field(
        default="sqlite+aiosqlite:///./redoost.db",
        description="Async SQLAlchemy database URL",
    )
    jwt_secret: SecretStr = Field(
        min_length=32, description="Key that signs the API's tokens"
    )

    # Accounts replace anonymous publishing when an OIDC issuer is set
    oidc_issuer: AnyHttpUrl | None = Field(
        default=None, description="OIDC issuer that users sign in with"
    )
    oidc_provider: Provider = Field(
        default=Provider.google, description="Who users sign in with, for the dashboard"
    )
    oidc_client_id: str | None = Field(default=None, description="OIDC client ID")
    oidc_client_secret: SecretStr | None = Field(
        default=None, description="OIDC client secret"
    )

    # S3 configuration
    s3_endpoint: AnyHttpUrl = Field(description="S3 endpoint used by the backend")
    s3_public_endpoint: AnyHttpUrl = Field(
        description="S3 endpoint used by browsers for uploads"
    )
    s3_region: str = Field(description="S3 region used for signing")
    s3_bucket: str = Field(description="Bucket that stores deployments")
    s3_access_key_id: str = Field(description="S3 access key ID")
    s3_secret_access_key: SecretStr = Field(description="S3 secret access key")

    # File size limits
    max_file_size: ByteSize = Field(
        default=ByteSize(10 * 1024**2), description="Maximum size of one file"
    )
    max_deployment_size: ByteSize = Field(
        default=ByteSize(50 * 1024**2), description="Maximum size of a deployment"
    )
    max_deployment_files: int = Field(
        default=500, description="Maximum number of files in a deployment"
    )

    # Garage rejects POST policies signed more than 24 hours ago
    upload_window: timedelta = Field(
        default=timedelta(hours=1),
        le=timedelta(hours=24),
        description="How long upload policies stay valid",
    )
    anonymous_site_lifetime: timedelta = Field(
        default=timedelta(days=7),
        gt=timedelta(0),
        description="How long anonymous sites stay online after their first publish",
    )
    anonymous_site_limit: int = Field(
        default=5, ge=1, description="Most sites an anonymous user can have at once"
    )

    @model_validator(mode="after")
    def validate_oidc(self) -> Self:
        if self.oidc_issuer and not (self.oidc_client_id and self.oidc_client_secret):
            raise ValueError("OIDC needs a client ID and secret")
        return self


settings = Settings()  # pyright: ignore[reportCallIssue]
