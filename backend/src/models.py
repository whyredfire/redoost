import secrets
from datetime import UTC, datetime
from enum import StrEnum
from typing import Self

from coolname import generate_slug
from pydantic import field_validator, model_validator
from sqlmodel import Field, SQLModel

from .config import settings


class DeploymentState(StrEnum):
    uploading = "uploading"
    ready = "ready"


class ManifestFile(SQLModel):
    path: str = Field(description="Path relative to the site root")
    size: int = Field(ge=0, le=settings.max_file_size, description="File size in bytes")
    sha256: str = Field(
        schema_extra={"pattern": r"^[A-Za-z0-9+/]{43}=$"},
        description="Base64-encoded SHA-256 digest",
    )
    gzip: bool = Field(
        default=False,
        description="Uploaded gzip-compressed, so it's served with Content-Encoding: gzip",
    )

    @field_validator("path")
    @classmethod
    def validate_path(cls, path: str) -> str:
        # Check path length and characters
        if (
            len(path.encode()) > 900
            or "\\" in path
            or not path.isprintable()
            or any(part in {"", ".", ".."} for part in path.split("/"))
        ):
            raise ValueError(
                "Must be a relative path of at most 900 bytes"
                " without empty, '.' or '..' segments"
            )
        return path


class Manifest(SQLModel):
    files: list[ManifestFile] = Field(
        min_length=1,
        max_length=settings.max_deployment_files,
        description="Files to upload, including a root index.html",
    )

    @model_validator(mode="after")
    def validate_files(self) -> Self:
        # Check for duplicate paths
        paths = {file.path for file in self.files}
        if len(paths) != len(self.files):
            raise ValueError("Duplicate file paths")
        # Check for root index.html
        if "index.html" not in paths:
            raise ValueError("A root index.html is required")
        # Check total size
        if sum(file.size for file in self.files) > settings.max_deployment_size:
            limit = settings.max_deployment_size.human_readable()
            raise ValueError(f"Deployment exceeds {limit}")
        return self


class Limits(SQLModel):
    max_file_size: int = Field(ge=0, description="Largest allowed file in bytes")
    max_deployment_size: int = Field(ge=0, description="Largest allowed site in bytes")
    max_deployment_files: int = Field(ge=1, description="Most files allowed in a site")


class DeploymentBase(SQLModel):
    slug: str = Field(
        default_factory=lambda: f"{generate_slug(2)}-{secrets.token_hex(2)}",
        primary_key=True,
        description="Site subdomain",
    )
    state: DeploymentState = Field(
        default=DeploymentState.uploading, description="Lifecycle state"
    )
    file_count: int = Field(ge=1, description="Number of files in the manifest")
    total_size: int = Field(ge=0, description="Total manifest size in bytes")
    spa: bool = Field(
        default=False, description="Serve index.html for missing pages (no 404.html)"
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), description="Creation time"
    )
    expires_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC) + settings.upload_window,
        description="When the upload policies expire",
    )
    available_until: datetime | None = Field(
        default=None,
        description="When the published site is removed; never when unset",
    )


class Deployment(DeploymentBase, table=True):
    token_hash: str = Field(
        index=True, description="SHA-256 hash of the management token"
    )


class UploadPolicy(SQLModel):
    path: str = Field(description="Path from the manifest")
    fields: dict[str, str] = Field(description="Form fields to send before the file")


class DeploymentCreated(DeploymentBase):
    token: str = Field(description="Management token, reusable for later deployments")
    upload_url: str = Field(description="URL to POST each file to")
    uploads: list[UploadPolicy] = Field(description="Signed upload policy per file")
