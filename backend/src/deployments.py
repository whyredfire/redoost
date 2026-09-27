import hashlib
import hmac
import secrets
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import col, or_, select, update

from .config import settings
from .database import Session
from .models import (
    Deployment,
    DeploymentBase,
    DeploymentCreated,
    DeploymentState,
    DeploymentUploads,
    Limits,
    Manifest,
    StoredFile,
)
from .storage import delete_objects, read_checksums, sign_uploads

router = APIRouter(prefix="/api/deployments", tags=["deployments"])

Credentials = Annotated[HTTPAuthorizationCredentials, Depends(HTTPBearer())]
OptionalCredentials = Annotated[
    HTTPAuthorizationCredentials | None, Depends(HTTPBearer(auto_error=False))
]


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def check_token(session: Session, token_hash: str) -> None:
    # Only tokens issued with an earlier deployment are valid
    query = select(Deployment.slug).where(Deployment.token_hash == token_hash)
    result = await session.exec(query.limit(1))
    if result.first() is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid token")


async def get_deployment(
    slug: str, session: Session, credentials: Credentials
) -> Deployment:
    deployment = await session.get(Deployment, slug)
    if deployment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deployment not found")
    if not hmac.compare_digest(
        deployment.token_hash, hash_token(credentials.credentials)
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid deployment token")
    return deployment


OwnedDeployment = Annotated[Deployment, Depends(get_deployment)]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_deployment(
    manifest: Manifest, session: Session, credentials: OptionalCredentials
) -> DeploymentCreated:
    if credentials:
        token = credentials.credentials
        await check_token(session, hash_token(token))
    else:
        token = secrets.token_urlsafe(32)
    deployment = Deployment(
        token_hash=hash_token(token),
        file_count=len(manifest.files),
        total_size=manifest.total_size,
        spa=manifest.spa,
    )
    upload_url, uploads = await sign_uploads(deployment.slug, manifest.files)
    session.add(deployment)
    await session.commit()
    return DeploymentCreated(
        **deployment.model_dump(), token=token, upload_url=upload_url, uploads=uploads
    )


@router.get("")
async def list_deployments(
    session: Session, credentials: Credentials
) -> list[DeploymentBase]:
    token_hash = hash_token(credentials.credentials)
    await check_token(session, token_hash)
    query = (
        select(Deployment)
        .where(Deployment.token_hash == token_hash)
        .where(Deployment.state == DeploymentState.ready)
        .where(
            or_(
                col(Deployment.available_until).is_(None),
                col(Deployment.available_until) > datetime.now(UTC),
            )
        )
        .order_by(col(Deployment.created_at).desc())
    )
    result = await session.exec(query)
    return list(result.all())


# Lets the frontend reject oversized sites before hashing them
@router.get("/limits")
async def read_limits() -> Limits:
    return Limits(
        max_file_size=settings.max_file_size,
        max_deployment_size=settings.max_deployment_size,
        max_deployment_files=settings.max_deployment_files,
    )


@router.get("/{slug}")
async def read_deployment(deployment: OwnedDeployment) -> DeploymentBase:
    return deployment


# Lets the frontend show what an update changes before it starts
@router.get("/{slug}/files")
async def read_files(deployment: OwnedDeployment) -> list[StoredFile]:
    checksums = await read_checksums(deployment.slug)
    return [StoredFile(path=path, sha256=sha256) for path, sha256 in checksums.items()]


@router.put("/{slug}")
async def update_deployment(
    manifest: Manifest, deployment: OwnedDeployment, session: Session
) -> DeploymentUploads:
    if deployment.available_until and deployment.available_until < datetime.now(UTC):
        raise HTTPException(status.HTTP_410_GONE, "Site has expired")
    if deployment.state != DeploymentState.ready:
        raise HTTPException(status.HTTP_409_CONFLICT, "Site isn't published yet")

    # Only new and changed files are uploaded again
    checksums = await read_checksums(deployment.slug)
    changed = [
        file for file in manifest.files if checksums.get(file.path) != file.sha256
    ]
    upload_url, uploads = await sign_uploads(deployment.slug, changed)

    # Taken in one statement, so two uploads to a site never overlap
    now = datetime.now(UTC)
    result = await session.exec(
        update(Deployment)
        .where(col(Deployment.slug) == deployment.slug)
        .where(col(Deployment.expires_at) <= now)
        .values(expires_at=now + settings.upload_window)
    )
    if result.rowcount == 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Another upload to this site is in progress"
        )
    await session.commit()
    return DeploymentUploads(
        **deployment.model_dump(), upload_url=upload_url, uploads=uploads
    )


@router.post("/{slug}/complete")
async def complete_deployment(
    manifest: Manifest, deployment: OwnedDeployment, session: Session
) -> DeploymentBase:
    checksums = await read_checksums(deployment.slug)
    uploaded = sum(checksums.get(file.path) == file.sha256 for file in manifest.files)
    paths = {file.path for file in manifest.files}
    extra = [path for path in checksums if path not in paths]

    now = datetime.now(UTC)
    if deployment.expires_at <= now:
        # Repeats a completion whose response was lost
        if (
            deployment.state == DeploymentState.ready
            and uploaded == len(manifest.files)
            and not extra
        ):
            return deployment
        raise HTTPException(status.HTTP_410_GONE, "Upload window has closed")
    if uploaded != len(manifest.files):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{uploaded} of {len(manifest.files)} files uploaded",
        )

    # Removed files stay online until the new ones are all in place
    await delete_objects(deployment.slug, extra)
    deployment.state = DeploymentState.ready
    deployment.file_count = len(manifest.files)
    deployment.total_size = manifest.total_size
    deployment.spa = manifest.spa
    # Frees the site for its next update
    deployment.expires_at = now
    # Fixed at publish time, so changing the setting never moves existing dates
    if settings.site_lifetime:
        deployment.available_until = now + settings.site_lifetime
    session.add(deployment)
    await session.commit()
    return deployment


# Frees the site for another update; files uploaded so far stay until then
@router.post("/{slug}/cancel", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_upload(deployment: OwnedDeployment, session: Session) -> None:
    deployment.expires_at = datetime.now(UTC)
    session.add(deployment)
    await session.commit()


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deployment(deployment: OwnedDeployment, session: Session) -> None:
    # Files go first, so a failed delete leaves the deployment in place to retry
    await delete_objects(deployment.slug)
    await session.delete(deployment)
    await session.commit()
