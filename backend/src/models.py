import secrets
from datetime import UTC, datetime
from enum import StrEnum
from typing import Self

from coolname import generate_slug
from pydantic import field_validator, model_validator
from sqlalchemy import BigInteger, UniqueConstraint
from sqlmodel import Field, SQLModel

from .config import Provider, settings


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
        if self.total_size > settings.max_deployment_size:
            limit = settings.max_deployment_size.human_readable()
            raise ValueError(f"Deployment exceeds {limit}")
        return self

    @property
    def total_size(self) -> int:
        return sum(file.size for file in self.files)

    @property
    def spa(self) -> bool:
        return all(file.path != "404.html" for file in self.files)


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
    total_size: int = Field(
        ge=0, sa_type=BigInteger, description="Total manifest size in bytes"
    )
    spa: bool = Field(
        default=False, description="Serve index.html for missing pages (no 404.html)"
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), description="Creation time"
    )
    expires_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC) + settings.upload_window,
        description="When the latest upload's policies expire; uploads are locked until then",
    )
    available_until: datetime | None = Field(
        default=None,
        description="When the published site is removed; never when unset",
    )


class Deployment(DeploymentBase, table=True):
    owner_id: str = Field(
        foreign_key="users.id", index=True, description="User who owns the site"
    )


class StoredFile(SQLModel):
    path: str = Field(description="Path relative to the site root")
    sha256: str | None = Field(description="Base64-encoded SHA-256 of the stored bytes")


class UploadPolicy(SQLModel):
    path: str = Field(description="Path from the manifest")
    fields: dict[str, str] = Field(description="Form fields to send before the file")


class DeploymentUploads(DeploymentBase):
    upload_url: str = Field(description="URL to POST each file to")
    uploads: list[UploadPolicy] = Field(
        description="Signed upload policy per new or changed file"
    )


class UserBase(SQLModel):
    id: str = Field(
        default_factory=lambda: secrets.token_hex(16),
        primary_key=True,
        description="User ID",
    )
    provider: Provider | None = Field(
        default=None, description="Who the user signs in with; anonymous when unset"
    )
    email: str | None = Field(default=None, description="Email from the provider")
    name: str | None = Field(default=None, description="Name from the provider")


class User(UserBase, table=True):
    # "user" is reserved in Postgres
    __tablename__ = "users"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (UniqueConstraint("provider", "subject"),)

    # Emails can change, so users are found by this
    subject: str | None = Field(
        default=None, description="The provider's stable ID for the user"
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), description="Creation time"
    )


class OidcConfig(SQLModel):
    provider: Provider = Field(description="Who users sign in with")
    authorization_endpoint: str = Field(description="Where sign-in starts")
    client_id: str = Field(description="OIDC client ID")
    scope: str = Field(description="Scopes to request")


class AuthConfig(SQLModel):
    oidc: OidcConfig | None = Field(
        description="How to sign in; publishing is anonymous when unset"
    )


class OidcMetadata(SQLModel):
    authorization_endpoint: str = Field(description="Where sign-in starts")
    token_endpoint: str = Field(description="Where codes are exchanged")
    userinfo_endpoint: str = Field(description="Where the user is read from")


class UserInfo(SQLModel):
    sub: str = Field(description="The provider's stable ID for the user")
    email: str | None = Field(default=None, description="The user's email")
    name: str | None = Field(default=None, description="The user's name")


class SignIn(SQLModel):
    code: str = Field(description="Authorization code from the provider")
    code_verifier: str = Field(description="PKCE verifier the code was requested with")
    redirect_uri: str = Field(description="Redirect URI the code was requested with")


class Token(SQLModel):
    token: str = Field(description="Bearer token for the API")
    user: UserBase = Field(description="Who the token belongs to")
