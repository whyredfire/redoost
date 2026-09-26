from datetime import timedelta
from typing import Literal

from pydantic import AnyHttpUrl, ByteSize, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="REDOOST_", extra="ignore")

    log_level: Literal["INFO", "VERBOSE"] = Field(description="Log verbosity")
    app_origin: str = Field(description="Frontend origin allowed to upload to S3")
    reload: bool = Field(default=False, description="Reload the API on code changes")
    database_url: str = Field(
        default="sqlite+aiosqlite:///./redoost.db",
        description="Async SQLAlchemy database URL",
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
    site_lifetime: timedelta | None = Field(
        default=None,
        description="How long published sites stay online; forever when unset",
    )


settings = Settings()  # pyright: ignore[reportCallIssue]
