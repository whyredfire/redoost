import re
import secrets
from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Any, Self

from coolname import generate_slug
from pydantic import AfterValidator, StringConstraints, field_validator, model_validator
from sqlalchemy import BigInteger, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from .config import Provider, settings

# Each publish or update uploads into its own folder, like brave-otter-1a2b/v-0123456789ab/,
# so a site switches to it in one step. Sites from before versions keep their files at
# the slug's root, next to their newer versions' folders.
version_folder = re.compile(r"v-[0-9a-f]{12}/")


def new_slug() -> str:
    return f"{generate_slug(2)}-{secrets.token_hex(2)}"


# The shape Nginx takes slugs in: two or more words and a hex tail
Slug = Annotated[
    str, StringConstraints(pattern=r"^[a-z]+(-[a-z]+)+-[0-9a-f]{4}$", max_length=63)
]


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
        # Version folders go inside a site's root, where these would be mistaken for one
        if version_folder.match(path):
            raise ValueError("Can't start with a folder named like v-0123456789ab")
        return path


# Short enough to show in a list next to the site's address
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]


def ahead(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    if moment <= datetime.now(UTC):
        raise ValueError("Must be in the future")
    return moment


# A time still to come, as expiries are set
Expiry = Annotated[datetime, AfterValidator(ahead)]
TokenName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]


class Manifest(SQLModel):
    files: list[ManifestFile] = Field(
        min_length=1,
        max_length=settings.max_deployment_files,
        description="Files to upload, including a root index.html",
    )
    description: Description | None = Field(
        default=None,
        description="Note to tell the site apart; kept as it is when missing",
    )
    version_description: Description | None = Field(
        default=None, description="What this version changes, shown with it"
    )
    expires_at: Expiry | None = Field(
        default=None,
        description="When the site goes offline; a new site never does without it, "
        "and an update keeps it as it is",
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


class NewSite(Manifest):
    slug: Slug | None = Field(
        default=None,
        description="Subdomain to publish at, from those GET /api/deployments/slugs "
        "offered; picked when missing",
    )


class SlugOffer(SQLModel, table=True):
    """An address offered for a new site, held for whoever it was offered to."""

    __tablename__ = "slug_offer"  # pyright: ignore[reportAssignmentType]

    slug: str = Field(primary_key=True, description="Site subdomain on offer")
    user_id: str = Field(
        foreign_key="users.id", ondelete="CASCADE", description="Who it was offered to"
    )
    expires_at: datetime = Field(index=True, description="When the offer lapses")


class Limits(SQLModel):
    max_file_size: int = Field(ge=0, description="Largest allowed file in bytes")
    max_deployment_size: int = Field(ge=0, description="Largest allowed site in bytes")
    max_deployment_files: int = Field(ge=1, description="Most files allowed in a site")


class Usage(SQLModel):
    used: int = Field(ge=0, description="Bytes the user's sites take up")
    limit: int = Field(ge=0, description="Most bytes the user's sites can take up")


class DeploymentBase(SQLModel):
    slug: str = Field(
        default_factory=new_slug,
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
    storage_size: int = Field(
        default=0,
        ge=0,
        sa_type=BigInteger,
        description="Bytes all the site's kept versions take up",
    )
    version_count: int = Field(
        default=0, ge=0, description="Versions kept, counting the one being served"
    )
    spa: bool = Field(
        default=False, description="Serve index.html for missing pages (no 404.html)"
    )
    enabled: bool = Field(
        default=True, description="Whether visitors can reach the site"
    )
    description: str = Field(
        default="", max_length=200, description="Note to tell the site apart"
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), description="Creation time"
    )
    expires_at: datetime | None = Field(
        default=None, description="When the site goes offline, if ever"
    )
    locked_until: datetime = Field(
        default_factory=lambda: datetime.now(UTC) + settings.upload_window,
        description="Until when the latest upload holds the site; its policies expire then",
    )


class DeploymentChange(SQLModel):
    enabled: bool | None = Field(
        default=None, description="Whether visitors can reach the site"
    )
    description: Description | None = Field(
        default=None, description="Note to tell the site apart"
    )
    expires_at: Expiry | None = Field(
        default=None, description="When the site goes offline; null for never"
    )


class Deployment(DeploymentBase, table=True):
    # For cleanup, which looks for uploads past their window
    __table_args__ = (
        Index("ix_deployment_state_locked_until", "state", "locked_until"),
    )

    owner_id: str = Field(
        foreign_key="users.id", index=True, description="User who owns the site"
    )
    folder: str | None = Field(
        default=None, description="Storage prefix of the files being served"
    )
    pending_folder: str | None = Field(
        default=None, description="Storage prefix the current upload goes to"
    )
    pending_size: int = Field(
        default=0,
        sa_type=BigInteger,
        description="Bytes an update uploads next to the files being served",
    )
    pending_digest: str | None = Field(
        default=None,
        description="SHA-256 of the manifest the current upload was signed for, so "
        "completing it can't publish other files",
    )


class Version(SQLModel, table=True):
    """A published version of a site, kept so an update can be undone.

    Its files are recorded as verified when it was published, so updates and their
    checks never read them back from storage.
    """

    folder: str = Field(primary_key=True, description="Storage prefix of the version")
    slug: str = Field(
        foreign_key="deployment.slug",
        ondelete="CASCADE",
        index=True,
        description="Site the version belongs to",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), description="When it was published"
    )
    retired_at: datetime | None = Field(
        default=None, description="When it stopped being served, if it has"
    )
    file_count: int = Field(ge=1, description="Number of files")
    size: int = Field(ge=0, sa_type=BigInteger, description="Bytes its files take up")
    spa: bool = Field(description="Serve index.html for missing pages (no 404.html)")
    description: str = Field(
        default="", max_length=200, description="What this version changes"
    )
    files: dict[str, dict[str, Any]] = Field(
        sa_type=JSONB, description="Each file's SHA-256 and stored size, by path"
    )

    @property
    def id(self) -> str:
        """The folder's name inside the site, like v-0123456789ab."""
        return self.folder.removeprefix(f"{self.slug}/").removesuffix("/")


class VersionInfo(SQLModel):
    id: str = Field(description="Version ID, like v-0123456789ab")
    created_at: datetime = Field(description="When it was published")
    file_count: int = Field(description="Number of files")
    size: int = Field(description="Bytes its files take up")
    description: str = Field(description="What this version changes")
    current: bool = Field(description="Whether visitors see this version")


class VersionChange(SQLModel):
    description: Description = Field(description="What this version changes")


class DiscardedFolder(SQLModel, table=True):
    """A folder no site uses any more, which cleanup deletes once its time comes.

    A cancelled upload's signed policies keep working until they expire, so its folder
    waits until then, counting toward its owner's storage, and anything uploaded to
    it meanwhile is deleted with it.
    """

    __tablename__ = "discarded_folder"  # pyright: ignore[reportAssignmentType]

    folder: str = Field(primary_key=True, description="Storage prefix to delete")
    owner_id: str = Field(
        foreign_key="users.id",
        ondelete="CASCADE",
        index=True,
        description="User whose storage it counts toward",
    )
    size: int = Field(
        default=0, sa_type=BigInteger, description="Bytes it counts until it's deleted"
    )
    delete_after: datetime = Field(
        index=True, description="When its upload policies, if any, stop working"
    )


class SitesChange(SQLModel):
    enabled: bool = Field(description="Whether visitors can reach the sites")


class ChangedSites(SQLModel):
    changed: list[str] = Field(
        description="Sites changed; ones that didn't exist are left out"
    )


class DeletedSites(SQLModel):
    deleted: list[str] = Field(
        description="Sites deleted; ones that didn't exist are left out"
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
    provider: Provider = Field(description="Who the user signs in with")
    email: str | None = Field(default=None, description="Email from the provider")
    name: str | None = Field(default=None, description="Name from the provider")
    picture: str | None = Field(
        default=None, description="Profile picture URL from the provider"
    )


class User(UserBase, table=True):
    # "user" is reserved in Postgres
    __tablename__ = "users"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (UniqueConstraint("provider", "subject"),)

    # Emails can change, so users are found by this
    subject: str = Field(description="The provider's stable ID for the user")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), description="Creation time"
    )


class OidcConfig(SQLModel):
    provider: Provider = Field(description="Who users sign in with")
    authorization_endpoint: str = Field(description="Where sign-in starts")
    client_id: str = Field(description="OIDC client ID")
    scope: str = Field(description="Scopes to request")


class AuthConfig(SQLModel):
    oidc: OidcConfig | None = Field(description="How to sign in with a provider")
    dev: bool = Field(description="Whether to sign in as a dev user instead")


class OidcMetadata(SQLModel):
    authorization_endpoint: str = Field(description="Where sign-in starts")
    token_endpoint: str = Field(description="Where codes are exchanged")
    userinfo_endpoint: str = Field(description="Where the user is read from")


class UserInfo(SQLModel):
    sub: str = Field(description="The provider's stable ID for the user")
    email: str | None = Field(default=None, description="The user's email")
    name: str | None = Field(default=None, description="The user's name")
    picture: str | None = Field(
        default=None, description="The user's profile picture URL"
    )

    # Shown as an image, so only addresses a browser fetches over TLS are kept
    @field_validator("picture")
    @classmethod
    def secure(cls, picture: str | None) -> str | None:
        return picture if picture and picture.startswith("https://") else None


class SignIn(SQLModel):
    code: str = Field(description="Authorization code from the provider")
    code_verifier: str = Field(description="PKCE verifier the code was requested with")
    redirect_uri: str = Field(description="Redirect URI the code was requested with")


class Token(SQLModel):
    token: str = Field(description="Bearer token for the API")
    user: UserBase = Field(description="Who the token belongs to")


class CliLogin(SQLModel, table=True):
    __tablename__ = "cli_login"  # pyright: ignore[reportAssignmentType]

    id: str = Field(
        default_factory=lambda: secrets.token_urlsafe(24),
        primary_key=True,
        description="ID in the sign-in link",
    )
    secret_hash: str = Field(description="SHA-256 hash of the CLI's secret")
    user_id: str | None = Field(
        default=None,
        foreign_key="users.id",
        ondelete="CASCADE",
        description="User who approved the sign-in",
    )
    expires_at: datetime = Field(
        index=True, description="When the sign-in link stops working"
    )


class CliLoginStarted(SQLModel):
    id: str = Field(description="ID for the sign-in link, <app origin>/cli/<id>")
    secret: str = Field(description="Secret the CLI claims its token with")
    expires_at: datetime = Field(description="When the sign-in link stops working")


class CliLoginClaim(SQLModel):
    secret: str = Field(description="Secret from starting the sign-in")
    name: TokenName = Field(
        default="CLI", description="Where the CLI runs, to tell its token apart"
    )


# Prefixed, so the API tells them from its sign-in tokens and secret scanners find them
api_token_prefix = "rdo_"


class Scope(StrEnum):
    """What a token may do. Reading comes with every scope.

    - read: list the user's sites, their files, and their storage use
    - publish: create sites and update them, completing or cancelling the upload
    - manage: take sites offline or online, describe them, and delete them
    """

    read = "read"
    publish = "publish"
    manage = "manage"


class TokenSource(StrEnum):
    """How a token was made.

    - cli: by redoost login, named after the machine, with every scope for 30 days
    - manual: in the dashboard's settings, with chosen scopes and expiry
    """

    cli = "cli"
    manual = "manual"


class ApiTokenCreate(SQLModel):
    name: TokenName = Field(description="What the token is for, like GitHub Actions")
    scopes: list[Scope] = Field(min_length=1, description="What it may do")
    expires_at: Expiry | None = Field(
        default=None, description="When it stops working, if ever"
    )

    @field_validator("scopes")
    @classmethod
    def distinct(cls, scopes: list[Scope]) -> list[Scope]:
        return list(dict.fromkeys(scopes))


# Acts as its user: made by redoost login, or by hand for pipelines
class ApiToken(SQLModel, table=True):
    __tablename__ = "api_token"  # pyright: ignore[reportAssignmentType]

    id: str = Field(default_factory=lambda: secrets.token_urlsafe(12), primary_key=True)
    name: str = Field(description="What the token is for")
    secret_hash: str = Field(unique=True, description="SHA-256 hash of the token")
    user_id: str = Field(
        foreign_key="users.id",
        ondelete="CASCADE",
        index=True,
        description="Who the token acts as",
    )
    source: TokenSource = Field(description="How the token was made")
    scopes: list[Scope] = Field(sa_type=JSONB, description="What it may do")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), description="Creation time"
    )
    last_used_at: datetime | None = Field(
        default=None, description="When it last authenticated a request"
    )
    expires_at: datetime | None = Field(
        default=None, description="When it stops working, if ever"
    )


class ApiTokenInfo(SQLModel):
    id: str = Field(description="Token ID, to revoke it")
    name: str = Field(description="What the token is for")
    source: TokenSource = Field(description="How the token was made")
    scopes: list[Scope] = Field(description="What it may do")
    created_at: datetime = Field(description="Creation time")
    last_used_at: datetime | None = Field(
        description="When it last authenticated a request, if ever"
    )
    expires_at: datetime | None = Field(description="When it stops working, if ever")


class ApiTokenCreated(ApiTokenInfo):
    token: str = Field(description="The token, shown only this once")
