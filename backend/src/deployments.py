from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import ColumnElement
from sqlmodel import col, func, or_, select, update

from .auth import CurrentUser
from .config import settings
from .database import Session
from .models import (
    Deployment,
    DeploymentBase,
    DeploymentState,
    DeploymentUploads,
    Limits,
    Manifest,
    StoredFile,
    User,
)
from .storage import delete_objects, read_checksums, sign_uploads

router = APIRouter(prefix="/api/deployments", tags=["deployments"])


async def get_deployment(slug: str, session: Session, user: CurrentUser) -> Deployment:
    deployment = await session.get(Deployment, slug)
    if deployment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deployment not found")
    if deployment.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your deployment")
    return deployment


def in_use() -> ColumnElement[bool]:
    # Expired sites and abandoned uploads don't count, though cleanup hasn't run
    now = datetime.now(UTC)
    return or_(
        (col(Deployment.state) == DeploymentState.ready)
        & or_(
            col(Deployment.available_until).is_(None),
            col(Deployment.available_until) > now,
        ),
        (col(Deployment.state) == DeploymentState.uploading)
        & (col(Deployment.expires_at) > now),
    )


async def check_anonymous_limit(session: Session, user: User) -> None:
    query = (
        select(func.count())
        .select_from(Deployment)
        .where(Deployment.owner_id == user.id)
        .where(in_use())
    )
    result = await session.exec(query)
    if result.one() >= settings.anonymous_site_limit:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Anonymous users can have up to {settings.anonymous_site_limit} sites"
            " at once",
        )


async def check_storage(
    session: Session, user: User, size: int, replacing: str | None = None
) -> None:
    query = (
        select(func.coalesce(func.sum(Deployment.total_size), 0))
        .where(Deployment.owner_id == user.id)
        .where(in_use())
    )
    # A site being updated counts at its new size instead
    if replacing:
        query = query.where(Deployment.slug != replacing)
    result = await session.exec(query)
    used = int(result.one())
    if used + size > settings.max_account_size:
        limit = settings.max_account_size.human_readable()
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, f"Your sites can use up to {limit} in total"
        )


OwnedDeployment = Annotated[Deployment, Depends(get_deployment)]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_deployment(
    manifest: Manifest, session: Session, user: CurrentUser
) -> DeploymentUploads:
    if user.provider is None:
        await check_anonymous_limit(session, user)
    await check_storage(session, user, manifest.total_size)
    deployment = Deployment(
        owner_id=user.id,
        file_count=len(manifest.files),
        total_size=manifest.total_size,
        spa=manifest.spa,
    )
    upload_url, uploads = await sign_uploads(deployment.slug, manifest.files)
    session.add(deployment)
    await session.commit()
    return DeploymentUploads(
        **deployment.model_dump(), upload_url=upload_url, uploads=uploads
    )


@router.get("")
async def list_deployments(session: Session, user: CurrentUser) -> list[DeploymentBase]:
    query = (
        select(Deployment)
        .where(Deployment.owner_id == user.id)
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
    manifest: Manifest, deployment: OwnedDeployment, session: Session, user: CurrentUser
) -> DeploymentUploads:
    if deployment.available_until and deployment.available_until < datetime.now(UTC):
        raise HTTPException(status.HTTP_410_GONE, "Site has expired")
    if deployment.state != DeploymentState.ready:
        raise HTTPException(status.HTTP_409_CONFLICT, "Site isn't published yet")
    await check_storage(session, user, manifest.total_size, replacing=deployment.slug)

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
    manifest: Manifest, deployment: OwnedDeployment, session: Session, user: CurrentUser
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
    # Fixed at the first publish, so updates and setting changes never move it
    if user.provider is None and deployment.available_until is None:
        deployment.available_until = now + settings.anonymous_site_lifetime
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
