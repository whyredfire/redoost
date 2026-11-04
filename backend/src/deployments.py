import hashlib
import json
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import ARRAY, ColumnElement, String, any_, literal
from sqlmodel import col, func, or_, select, update

from .auth import CurrentUser, needs
from .config import settings
from .database import Session
from .models import (
    ChangedSites,
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
    NewSite,
    Scope,
    SitesChange,
    SlugOffer,
    StoredFile,
    Usage,
    User,
    Version,
    VersionChange,
    VersionInfo,
    new_slug,
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
# How many addresses are offered at a time
slug_options = 4

# Short enough for a URL, as each one is a query parameter
max_bulk_sites = 100

# Several sites to change at once, as ?slug=...&slug=...
Slugs = Annotated[
    list[str],
    Query(
        alias="slug",
        min_length=1,
        max_length=max_bulk_sites,
        description=f"Sites to change, up to {max_bulk_sites}",
    ),
]


async def get_deployment(slug: str, session: Session, user: CurrentUser) -> Deployment:
    deployment = await session.get(Deployment, slug)
    if deployment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deployment not found")
    if deployment.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your deployment")
    return deployment


OwnedDeployment = Annotated[Deployment, Depends(get_deployment)]


def in_use() -> ColumnElement[bool]:
    # Abandoned uploads don't count, though cleanup hasn't run
    return or_(
        col(Deployment.state) == DeploymentState.ready,
        col(Deployment.expires_at) > datetime.now(UTC),
    )


async def used_storage(
    session: Session, user: User, replacing: str | None = None
) -> int:
    # Every kept version, and the update in progress if any
    footprint = Deployment.storage_size + Deployment.pending_size
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


async def check_quota(
    session: Session, user: User, size: int, replacing: str | None = None
) -> None:
    # Other quota checks for the user wait until this transaction ends, or concurrent
    # uploads could all see the same usage and all go ahead. It locks the user's row,
    # so callers commit soon after, and do their slower S3 work beforehand.
    await session.exec(select(User.id).where(User.id == user.id).with_for_update())
    used = await used_storage(session, user, replacing)
    if used + size > settings.max_account_size:
        limit = settings.max_account_size.human_readable()
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, f"Your sites can use up to {limit} in total"
        )


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


@router.post(
    "", status_code=status.HTTP_201_CREATED, dependencies=[needs(Scope.publish)]
)
async def create_deployment(
    manifest: NewSite, session: Session, user: CurrentUser
) -> DeploymentUploads:
    if manifest.slug:
        offer = await session.get(SlugOffer, manifest.slug)
        if (
            offer is None
            or offer.user_id != user.id
            or offer.expires_at <= datetime.now(UTC)
        ):
            raise HTTPException(
                status.HTTP_409_CONFLICT, "That address is no longer on offer"
            )
        await session.delete(offer)
    deployment = Deployment(
        slug=manifest.slug or new_slug(),
        owner_id=user.id,
        file_count=len(manifest.files),
        total_size=manifest.total_size,
        storage_size=manifest.total_size,
        spa=manifest.spa,
        description=manifest.description or "",
    )
    deployment.pending_folder = new_folder(deployment.slug)
    deployment.pending_digest = manifest_digest(manifest)
    upload_url, uploads = await sign_uploads(deployment.pending_folder, manifest.files)
    await check_quota(session, user, manifest.total_size)
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


# Unused addresses to publish a new site at, held for the user as long as an upload
# window, so only what was offered can be picked
@router.get("/slugs", dependencies=[needs(Scope.publish)])
async def suggest_slugs(session: Session, user: CurrentUser) -> list[str]:
    expires_at = datetime.now(UTC) + settings.upload_window
    slugs = [new_slug() for _ in range(slug_options)]
    for slug in slugs:
        session.add(SlugOffer(slug=slug, user_id=user.id, expires_at=expires_at))
    await session.commit()
    return slugs


@router.get("/{slug}")
async def read_deployment(deployment: OwnedDeployment) -> DeploymentBase:
    return deployment


@router.patch("/{slug}", dependencies=[needs(Scope.manage)])
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


async def served_files(session: Session, folder: str) -> dict[str, StoredObject]:
    """A published version's files, by path."""
    version = await session.get(Version, folder)
    # Only versions an older release published mid-rollout lack them; updating
    # one uploads every file again
    if version is None:
        return {}
    return {
        path: StoredObject(sha256=file["sha256"], size=file["size"])
        for path, file in version.files.items()
    }


async def discard_version(
    session: Session, deployment: Deployment, version: Version, now: datetime
) -> None:
    """Deletes a version, waiting out Nginx's cache if it was served just now."""
    if version.retired_at and version.retired_at > now - retire_after:
        session.add(
            DiscardedFolder(
                folder=version.folder,
                owner_id=deployment.owner_id,
                delete_after=version.retired_at + retire_after,
            )
        )
    else:
        await delete_folder(version.folder)
    await session.delete(version)
    deployment.storage_size -= version.size
    deployment.version_count -= 1


async def site_versions(session: Session, deployment: Deployment) -> Sequence[Version]:
    """The site's versions, newest first."""
    query = (
        select(Version)
        .where(Version.slug == deployment.slug)
        .order_by(col(Version.created_at).desc())
    )
    return (await session.exec(query)).all()


async def trim_versions(
    session: Session, deployment: Deployment, now: datetime
) -> None:
    """Drops the oldest versions beyond what each site keeps."""
    versions = await site_versions(session, deployment)
    for version in versions[settings.kept_versions :]:
        if version.folder != deployment.folder:
            await discard_version(session, deployment, version, now)


# Lets the frontend show what an update changes before it starts
@router.get("/{slug}/files")
async def read_files(deployment: OwnedDeployment, session: Session) -> list[StoredFile]:
    if deployment.folder is None:
        return []
    objects = await served_files(session, deployment.folder)
    return [
        StoredFile(path=path, sha256=stored.sha256)
        for path, stored in sorted(objects.items())
    ]


@router.put("/{slug}", dependencies=[needs(Scope.publish)])
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
    folder = new_folder(deployment.slug)
    upload_url, uploads = await sign_uploads(folder, changed)
    # The kept versions stay stored while the update is in progress
    await check_quota(
        session,
        user,
        deployment.storage_size + pending_size,
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
    return DeploymentUploads(
        **deployment.model_dump(), upload_url=upload_url, uploads=uploads
    )


@router.post("/{slug}/complete", dependencies=[needs(Scope.publish)])
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

    paths = {file.path for file in manifest.files}
    await delete_paths(folder, [path for path in uploaded if path not in paths])
    if deployment.folder and copied:
        await copy_files(deployment.folder, folder, [file.path for file in copied])

    # Checked again, as other uploads may have finished since this one started
    replaced = deployment.folder if deployment.folder != folder else None
    storage_size = deployment.storage_size + total_size if replaced else total_size
    await check_quota(session, user, storage_size, replacing=deployment.slug)
    # The window may have closed while files were copied, letting cleanup or a new
    # update take the folder; locked, so neither can until this commits
    await session.refresh(deployment, with_for_update=True)
    if deployment.pending_folder != folder:
        # A repeated request finished it first
        if deployment.folder == folder:
            return deployment
        raise HTTPException(status.HTTP_410_GONE, "Upload window has closed")
    session.add(
        Version(
            folder=folder,
            slug=deployment.slug,
            created_at=now,
            file_count=len(manifest.files),
            size=total_size,
            spa=manifest.spa,
            description=manifest.version_description or "",
            files={
                file.path: {
                    "sha256": stored[file.path].sha256,
                    "size": stored[file.path].size,
                }
                for file in manifest.files
            },
        )
    )
    if replaced:
        previous = await session.get(Version, replaced)
        if previous:
            previous.retired_at = now
            session.add(previous)
    deployment.storage_size = storage_size
    deployment.version_count += 1

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
    await trim_versions(session, deployment, now)
    session.add(deployment)
    await session.commit()
    return deployment


async def get_version(
    session: Session, deployment: Deployment, version_id: str
) -> Version:
    version = await session.get(Version, f"{deployment.slug}/{version_id}/")
    if version is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")
    return version


def version_info(version: Version, deployment: Deployment) -> VersionInfo:
    return VersionInfo.model_validate(
        version,
        update={"id": version.id, "current": version.folder == deployment.folder},
    )


@router.get("/{slug}/versions")
async def list_versions(
    deployment: OwnedDeployment, session: Session
) -> list[VersionInfo]:
    return [
        version_info(version, deployment)
        for version in await site_versions(session, deployment)
    ]


@router.patch("/{slug}/versions/{version_id}", dependencies=[needs(Scope.manage)])
async def change_version(
    version_id: str,
    change: VersionChange,
    deployment: OwnedDeployment,
    session: Session,
) -> VersionInfo:
    version = await get_version(session, deployment, version_id)
    version.description = change.description
    session.add(version)
    await session.commit()
    return version_info(version, deployment)


# Points the site back at a kept version; nothing is uploaded or copied
@router.post(
    "/{slug}/versions/{version_id}/restore", dependencies=[needs(Scope.publish)]
)
async def restore_version(
    version_id: str, deployment: OwnedDeployment, session: Session
) -> DeploymentBase:
    version = await get_version(session, deployment, version_id)
    now = datetime.now(UTC)
    # Locked, as an update completing meanwhile would switch folders too
    await session.refresh(deployment, with_for_update=True)
    if deployment.expires_at > now:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Another upload to this site is in progress"
        )
    if version.folder == deployment.folder:
        return deployment
    current = (
        await session.get(Version, deployment.folder) if deployment.folder else None
    )
    if current:
        current.retired_at = now
        session.add(current)
    version.retired_at = None
    session.add(version)
    deployment.folder = version.folder
    deployment.file_count = version.file_count
    deployment.total_size = version.size
    deployment.spa = version.spa
    session.add(deployment)
    await session.commit()
    return deployment


@router.delete(
    "/{slug}/versions/{version_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[needs(Scope.manage)],
)
async def delete_version(
    version_id: str, deployment: OwnedDeployment, session: Session
) -> None:
    version = await get_version(session, deployment, version_id)
    if version.folder == deployment.folder:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "The version being served can't be deleted"
        )
    await discard_version(session, deployment, version, datetime.now(UTC))
    session.add(deployment)
    await session.commit()


# Keeps only the version being served
@router.delete("/{slug}/versions", dependencies=[needs(Scope.manage)])
async def prune_versions(
    deployment: OwnedDeployment, session: Session
) -> DeploymentBase:
    now = datetime.now(UTC)
    for version in await site_versions(session, deployment):
        if version.folder != deployment.folder:
            await discard_version(session, deployment, version, now)
    session.add(deployment)
    await session.commit()
    return deployment


# Frees the site for another update, deleting what it uploaded so far
@router.post(
    "/{slug}/cancel",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[needs(Scope.publish)],
)
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


async def owned_sites(
    session: Session, user: User, slugs: list[str]
) -> Sequence[Deployment]:
    """The sites among slugs, all the user's; ones that don't exist are skipped."""
    query = (
        select(Deployment)
        .where(col(Deployment.slug) == any_(literal(sorted(set(slugs)), ARRAY(String))))
        .order_by(col(Deployment.slug))
    )
    deployments = (await session.exec(query)).all()
    if any(deployment.owner_id != user.id for deployment in deployments):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your deployment")
    return deployments


# Repeating it changes nothing more, as with deleting several
@router.patch("", dependencies=[needs(Scope.manage)])
async def change_deployments(
    slugs: Slugs, change: SitesChange, session: Session, user: CurrentUser
) -> ChangedSites:
    found = [deployment.slug for deployment in await owned_sites(session, user, slugs)]
    await session.exec(
        update(Deployment)
        .where(col(Deployment.slug) == any_(literal(found, ARRAY(String))))
        .values(enabled=change.enabled)
    )
    await session.commit()
    return ChangedSites(changed=found)


# Sites that don't exist are skipped, so a repeated request deletes nothing twice
@router.delete("", dependencies=[needs(Scope.manage)])
async def delete_deployments(
    slugs: Slugs, session: Session, user: CurrentUser
) -> DeletedSites:
    deployments = await owned_sites(session, user, slugs)
    await remove_sites(session, deployments)
    await session.commit()
    return DeletedSites(deleted=[deployment.slug for deployment in deployments])


@router.delete(
    "/{slug}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[needs(Scope.manage)],
)
async def delete_deployment(deployment: OwnedDeployment, session: Session) -> None:
    await remove_sites(session, [deployment])
    await session.commit()
