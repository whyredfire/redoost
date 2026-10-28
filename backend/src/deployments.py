import hashlib
import json
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import ARRAY, ColumnElement, String, any_, literal
from sqlmodel import col, delete, func, or_, select

from .auth import CurrentUser
from .config import settings
from .database import Session
from .models import (
    DeletedSites,
    Deployment,
    DeploymentBase,
    DeploymentChange,
    DeploymentState,
    DeploymentUploads,
    DiscardedFolder,
    Limits,
    Manifest,
    ManifestFile,
    StoredFile,
    Usage,
    User,
    VersionFiles,
)
from .storage import (
    StoredObject,
    copy_files,
    delete_folder,
    delete_paths,
    delete_sites,
    new_folder,
    read_objects,
    sign_uploads,
)

router = APIRouter(prefix="/api/deployments", tags=["deployments"])

# Nginx caches which folder a site serves for a few seconds, and keeps serving it
# while the API is unreachable, so the previous one stays a while before it's deleted
retire_after = timedelta(minutes=2)

# Short enough for a URL, as each one is a query parameter
max_bulk_delete = 100


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
    sites = (
        select(func.coalesce(func.sum(footprint), 0))
        .where(Deployment.owner_id == user.id)
        .where(in_use())
    )
    # A site being changed counts at the size it's about to take instead
    if replacing:
        sites = sites.where(Deployment.slug != replacing)
    # Cancelled uploads, until their policies stop working
    discarded = (
        select(func.coalesce(func.sum(DiscardedFolder.size), 0))
        .where(DiscardedFolder.owner_id == user.id)
        .where(col(DiscardedFolder.delete_after) > datetime.now(UTC))
    )
    result = await session.exec(
        select(sites.scalar_subquery() + discarded.scalar_subquery())
    )
    return int(result.one())


async def lock_storage(session: Session, user: User) -> None:
    """Makes other quota checks for the user wait until this transaction ends.

    Without it, concurrent uploads could all see the same usage and all go ahead.
    It locks the user's row, so callers commit soon after, and do their slower S3
    work beforehand.
    """
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


def manifest_digest(manifest: Manifest) -> str:
    files = sorted(
        (file.path, file.size, file.sha256, file.gzip) for file in manifest.files
    )
    return hashlib.sha256(json.dumps(files).encode()).hexdigest()


def discard_upload(session: Session, deployment: Deployment) -> None:
    """Keeps an unfinished upload's folder counted until its policies stop working."""
    folder = deployment.pending_folder
    if folder is None or folder == deployment.folder:
        return
    size = (
        deployment.pending_size
        if deployment.state == DeploymentState.ready
        else deployment.total_size
    )
    session.add(
        DiscardedFolder(
            folder=folder,
            owner_id=deployment.owner_id,
            size=size,
            delete_after=max(deployment.expires_at, datetime.now(UTC)),
        )
    )


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
    deployment.pending_digest = manifest_digest(manifest)
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


async def served_files(session: Session, folder: str) -> dict[str, StoredObject]:
    """A published version's files, by path.

    Versions published before their files were recorded are read from storage.
    """
    version = await session.get(VersionFiles, folder)
    if version is None:
        return await read_objects(folder)
    return {
        path: StoredObject(sha256=file["sha256"], size=file["size"])
        for path, file in version.files.items()
    }


async def forget_version(session: Session, folder: str) -> None:
    await session.exec(delete(VersionFiles).where(col(VersionFiles.folder) == folder))


async def discard_retired(session: Session, deployment: Deployment) -> None:
    if deployment.retired_folder:
        await delete_folder(deployment.retired_folder)
        await forget_version(session, deployment.retired_folder)
    deployment.retired_folder = None
    deployment.retired_at = None
    deployment.retired_size = 0


@router.get("/{slug}/files")
async def read_files(deployment: OwnedDeployment, session: Session) -> list[StoredFile]:
    if deployment.folder is None:
        return []
    objects = await served_files(session, deployment.folder)
    return [
        StoredFile(path=path, sha256=stored.sha256)
        for path, stored in sorted(objects.items())
    ]


@router.put("/{slug}")
async def update_deployment(
    manifest: Manifest, deployment: OwnedDeployment, session: Session, user: CurrentUser
) -> DeploymentUploads:
    if deployment.state != DeploymentState.ready or deployment.folder is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Site isn't published yet")
    now = datetime.now(UTC)

    # Only new and changed files are uploaded; the rest are copied when it completes
    served = await served_files(session, deployment.folder)
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

    # Locked, so two uploads to a site never overlap
    await session.refresh(deployment, with_for_update=True)
    if deployment.expires_at > now:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Another upload to this site is in progress"
        )
    # An earlier update nobody finished or cancelled, whose window has closed
    abandoned = deployment.pending_folder
    deployment.expires_at = now + settings.upload_window
    deployment.pending_folder = folder
    deployment.pending_size = pending_size
    deployment.pending_digest = manifest_digest(manifest)
    session.add(deployment)
    await session.commit()

    if abandoned and abandoned != deployment.folder:
        await delete_folder(abandoned)
    if retired_expired(deployment, now):
        await discard_retired(session, deployment)
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
            served = await served_files(session, deployment.folder)
            if len(served) == len(manifest.files) and all(
                matches(served.get(file.path), file) for file in manifest.files
            ):
                return deployment
        raise HTTPException(status.HTTP_410_GONE, "Upload window has closed")
    # So leftover policies can only rewrite the files it publishes, with the same bytes
    if deployment.pending_digest != manifest_digest(manifest):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "These aren't the files this upload started with"
        )

    uploaded = await read_objects(folder)
    served = (
        await served_files(session, deployment.folder)
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
    retired = deployment.retired_folder
    if retired:
        await delete_folder(retired)

    # Checked again, as other uploads may have finished since this one started
    await check_storage(
        session, user, total_size + retired_size, replacing=deployment.slug
    )
    # The window may have closed while files were copied, letting cleanup or a new
    # update take the folder; locked, so neither can until this commits
    await session.refresh(deployment, with_for_update=True)
    if deployment.pending_folder != folder:
        # A repeated request finished it first
        if deployment.folder == folder:
            return deployment
        raise HTTPException(status.HTTP_410_GONE, "Upload window has closed")
    if retired:
        await forget_version(session, retired)
    session.add(
        VersionFiles(
            folder=folder,
            slug=deployment.slug,
            files={
                file.path: {
                    "sha256": stored[file.path].sha256,
                    "size": stored[file.path].size,
                }
                for file in manifest.files
            },
        )
    )
    replaced = deployment.folder if deployment.folder != folder else None
    deployment.retired_folder = replaced
    deployment.retired_at = now if replaced else None
    deployment.retired_size = retired_size if replaced else 0

    # Visitors switch to the new files all at once
    deployment.folder = folder
    deployment.pending_folder = None
    deployment.pending_size = 0
    deployment.pending_digest = None
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
    # Its policies still work, so anything uploaded with them is deleted later
    discard_upload(session, deployment)
    deployment.pending_folder = None
    deployment.pending_size = 0
    deployment.pending_digest = None
    deployment.expires_at = datetime.now(UTC)
    session.add(deployment)
    await session.commit()


async def remove_sites(session: Session, deployments: Sequence[Deployment]) -> None:
    """Deletes sites and their files; the caller commits."""
    # Files go first, so a failed delete leaves the deployments in place to retry
    await delete_sites(deployment.slug for deployment in deployments)
    for deployment in deployments:
        discard_upload(session, deployment)
        await session.delete(deployment)


# Sites that don't exist are skipped, so a repeated request deletes nothing twice
@router.delete("")
async def delete_deployments(
    slug: Annotated[
        list[str],
        Query(
            min_length=1,
            max_length=max_bulk_delete,
            description=f"Sites to delete, up to {max_bulk_delete}",
        ),
    ],
    session: Session,
    user: CurrentUser,
) -> DeletedSites:
    query = (
        select(Deployment)
        .where(col(Deployment.slug) == any_(literal(sorted(set(slug)), ARRAY(String))))
        .order_by(col(Deployment.slug))
    )
    deployments = (await session.exec(query)).all()
    if any(deployment.owner_id != user.id for deployment in deployments):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your deployment")
    await remove_sites(session, deployments)
    await session.commit()
    return DeletedSites(deleted=[deployment.slug for deployment in deployments])


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deployment(deployment: OwnedDeployment, session: Session) -> None:
    await remove_sites(session, [deployment])
    await session.commit()
