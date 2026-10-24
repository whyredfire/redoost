from datetime import UTC, datetime, timedelta
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
    DeploymentChange,
    DeploymentState,
    DeploymentUploads,
    Limits,
    Manifest,
    ManifestFile,
    StoredFile,
    Usage,
    User,
)
from .storage import (
    StoredObject,
    copy_files,
    delete_folder,
    delete_paths,
    delete_site,
    new_folder,
    read_objects,
    sign_uploads,
)

router = APIRouter(prefix="/api/deployments", tags=["deployments"])

# Nginx caches which folder a site serves for a few seconds, and keeps serving it
# while the API is unreachable, so the previous one stays a while before it's deleted
retire_after = timedelta(minutes=2)


async def get_deployment(slug: str, session: Session, user: CurrentUser) -> Deployment:
    deployment = await session.get(Deployment, slug)
    if deployment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deployment not found")
    if deployment.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your deployment")
    return deployment


def in_use() -> ColumnElement[bool]:
    # Abandoned uploads don't count, though cleanup hasn't run
    return or_(
        col(Deployment.state) == DeploymentState.ready,
        col(Deployment.expires_at) > datetime.now(UTC),
    )


async def used_storage(
    session: Session, user: User, replacing: str | None = None
) -> int:
    # Updates and the version they replaced take space until they're finished or deleted
    footprint = (
        Deployment.total_size + Deployment.pending_size + Deployment.retired_size
    )
    query = (
        select(func.coalesce(func.sum(footprint), 0))
        .where(Deployment.owner_id == user.id)
        .where(in_use())
    )
    # A site being changed counts at the size it's about to take instead
    if replacing:
        query = query.where(Deployment.slug != replacing)
    result = await session.exec(query)
    return int(result.one())


async def lock_storage(session: Session, user: User) -> None:
    """Makes other quota checks for the user wait until this transaction ends.

    Without it, concurrent uploads could all see the same usage and all go ahead.
    Postgres locks the user's row; SQLite ignores FOR UPDATE, so a write there takes
    its single write lock instead. Either way, callers commit soon after, and do
    their slower S3 work beforehand.
    """
    if session.get_bind().dialect.name == "sqlite":
        query = update(User).where(col(User.id) == user.id).values(id=User.id)
        await session.exec(query)
    else:
        await session.exec(select(User.id).where(User.id == user.id).with_for_update())


async def check_storage(
    session: Session, user: User, size: int, replacing: str | None = None
) -> None:
    await lock_storage(session, user)
    used = await used_storage(session, user, replacing)
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
    deployment = Deployment(
        owner_id=user.id,
        file_count=len(manifest.files),
        total_size=manifest.total_size,
        spa=manifest.spa,
        description=manifest.description or "",
    )
    deployment.pending_folder = new_folder(deployment.slug)
    upload_url, uploads = await sign_uploads(deployment.pending_folder, manifest.files)
    await check_storage(session, user, manifest.total_size)
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


@router.get("/usage")
async def read_usage(session: Session, user: CurrentUser) -> Usage:
    used = await used_storage(session, user)
    return Usage(used=used, limit=settings.max_account_size)


@router.get("/{slug}")
async def read_deployment(deployment: OwnedDeployment) -> DeploymentBase:
    return deployment


# Lets the frontend show what an update changes before it starts
@router.patch("/{slug}")
async def change_deployment(
    change: DeploymentChange, deployment: OwnedDeployment, session: Session
) -> DeploymentBase:
    if change.enabled is not None:
        deployment.enabled = change.enabled
    if change.description is not None:
        deployment.description = change.description
    session.add(deployment)
    await session.commit()
    return deployment


def matches(stored: StoredObject | None, file: ManifestFile) -> bool:
    return (
        stored is not None and stored.sha256 == file.sha256 and stored.size == file.size
    )


def retired_expired(deployment: Deployment, now: datetime) -> bool:
    return (
        deployment.retired_at is not None
        and deployment.retired_at <= now - retire_after
    )


async def discard_retired(deployment: Deployment) -> None:
    if deployment.retired_folder:
        await delete_folder(deployment.retired_folder)
    deployment.retired_folder = None
    deployment.retired_at = None
    deployment.retired_size = 0


@router.get("/{slug}/files")
async def read_files(deployment: OwnedDeployment) -> list[StoredFile]:
    if deployment.folder is None:
        return []
    objects = await read_objects(deployment.folder)
    return [
        StoredFile(path=path, sha256=stored.sha256) for path, stored in objects.items()
    ]


@router.put("/{slug}")
async def update_deployment(
    manifest: Manifest, deployment: OwnedDeployment, session: Session, user: CurrentUser
) -> DeploymentUploads:
    if deployment.state != DeploymentState.ready or deployment.folder is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Site isn't published yet")
    now = datetime.now(UTC)

    # Only new and changed files are uploaded; the rest are copied when it completes
    served = await read_objects(deployment.folder)
    changed = [
        file for file in manifest.files if not matches(served.get(file.path), file)
    ]
    pending_size = sum(file.size for file in changed)
    retired_size = 0 if retired_expired(deployment, now) else deployment.retired_size
    folder = new_folder(deployment.slug)
    upload_url, uploads = await sign_uploads(folder, changed)
    # Both versions are stored until the update finishes
    await check_storage(
        session,
        user,
        deployment.total_size + pending_size + retired_size,
        replacing=deployment.slug,
    )

    # Taken in one statement, so two uploads to a site never overlap
    abandoned = deployment.pending_folder
    result = await session.exec(
        update(Deployment)
        .where(col(Deployment.slug) == deployment.slug)
        .where(col(Deployment.expires_at) <= now)
        .values(
            expires_at=now + settings.upload_window,
            pending_folder=folder,
            pending_size=pending_size,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Another upload to this site is in progress"
        )
    await session.commit()

    # An earlier update nobody finished or cancelled, whose window has closed
    if abandoned and abandoned != deployment.folder:
        await delete_folder(abandoned)
    if retired_expired(deployment, now):
        await discard_retired(deployment)
        session.add(deployment)
        await session.commit()
    return DeploymentUploads(
        **deployment.model_dump(), upload_url=upload_url, uploads=uploads
    )


@router.post("/{slug}/complete")
async def complete_deployment(
    manifest: Manifest, deployment: OwnedDeployment, session: Session, user: CurrentUser
) -> DeploymentBase:
    now = datetime.now(UTC)
    folder = deployment.pending_folder
    if deployment.expires_at <= now or folder is None:
        # Repeats a completion whose response was lost
        if deployment.state == DeploymentState.ready and deployment.folder:
            served = await read_objects(deployment.folder)
            if len(served) == len(manifest.files) and all(
                matches(served.get(file.path), file) for file in manifest.files
            ):
                return deployment
        raise HTTPException(status.HTTP_410_GONE, "Upload window has closed")

    uploaded = await read_objects(folder)
    served = (
        await read_objects(deployment.folder)
        if deployment.folder and deployment.folder != folder
        else {}
    )
    # Files the update didn't change come from the version being served
    copied = [
        file
        for file in manifest.files
        if not matches(uploaded.get(file.path), file)
        and matches(served.get(file.path), file)
    ]
    found = len(copied) + sum(
        matches(uploaded.get(file.path), file) for file in manifest.files
    )
    if found != len(manifest.files):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"{found} of {len(manifest.files)} files uploaded"
        )

    # Counted from storage, as the manifest's sizes are only the client's word
    stored = {**served, **uploaded}
    total_size = sum(stored[file.path].size for file in manifest.files)
    # The replaced version's files that the new one doesn't share
    retired_size = sum(item.size for item in served.values()) - sum(
        file.size for file in copied
    )

    paths = {file.path for file in manifest.files}
    await delete_paths(folder, [path for path in uploaded if path not in paths])
    if deployment.folder and copied:
        await copy_files(deployment.folder, folder, [file.path for file in copied])
    # Only the version just replaced is kept, so a burst of updates can't pile them up
    await discard_retired(deployment)

    # Checked again, as other uploads may have finished since this one started
    await check_storage(
        session, user, total_size + retired_size, replacing=deployment.slug
    )
    if deployment.folder and deployment.folder != folder:
        deployment.retired_folder = deployment.folder
        deployment.retired_at = now
        deployment.retired_size = retired_size

    # Visitors switch to the new files all at once
    deployment.folder = folder
    deployment.pending_folder = None
    deployment.pending_size = 0
    deployment.state = DeploymentState.ready
    deployment.file_count = len(manifest.files)
    deployment.total_size = total_size
    deployment.spa = manifest.spa
    # Set here rather than when the update starts, so a failed update keeps the old one
    if manifest.description is not None:
        deployment.description = manifest.description
    # Frees the site for its next update
    deployment.expires_at = now
    session.add(deployment)
    await session.commit()
    return deployment


# Frees the site for another update, deleting what it uploaded so far
@router.post("/{slug}/cancel", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_upload(deployment: OwnedDeployment, session: Session) -> None:
    if deployment.pending_folder and deployment.pending_folder != deployment.folder:
        await delete_folder(deployment.pending_folder)
    deployment.pending_folder = None
    deployment.pending_size = 0
    deployment.expires_at = datetime.now(UTC)
    session.add(deployment)
    await session.commit()


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deployment(deployment: OwnedDeployment, session: Session) -> None:
    # Files go first, so a failed delete leaves the deployment in place to retry
    await delete_site(deployment.slug)
    await session.delete(deployment)
    await session.commit()
