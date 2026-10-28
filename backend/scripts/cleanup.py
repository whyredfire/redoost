import asyncio
import logging
from datetime import UTC, datetime

from sqlmodel import and_, col, delete, or_, select, update
from sqlmodel.ext.asyncio.session import AsyncSession

from src.database import engine
from src.deployments import retire_after
from src.models import CliLogin, Deployment, DeploymentState, DiscardedFolder
from src.storage import delete_folder, delete_sites, slug_pages

# Caps each run, so a large backlog is cleared over several runs
batch_size = 100


def discard(
    session: AsyncSession, folder: str | None, owner_id: str, now: datetime
) -> None:
    if folder:
        session.add(DiscardedFolder(folder=folder, owner_id=owner_id, delete_after=now))


async def cleanup(session: AsyncSession) -> tuple[int, int, int]:
    # Unfinished uploads past their window, whose policies can no longer be used
    expired_query = (
        select(Deployment)
        .where(col(Deployment.state) == DeploymentState.uploading)
        .where(col(Deployment.expires_at) < datetime.now(UTC))
        .limit(batch_size)
    )
    expired = (await session.exec(expired_query)).all()

    # Rows are committed before any upload, so a folder without one is leftover.
    # Listing each page before querying for its slugs keeps that true here, and
    # going a page at a time keeps memory and query size flat however many sites there are.
    orphaned: list[str] = []
    async for slugs in slug_pages():
        query = select(Deployment.slug).where(col(Deployment.slug).in_(slugs))
        known = set((await session.exec(query)).all())
        orphaned.extend(slug for slug in slugs if slug not in known)
        if len(orphaned) >= batch_size:
            break
    orphaned = orphaned[:batch_size]

    await delete_sites([*orphaned, *(deployment.slug for deployment in expired)])
    for deployment in expired:
        await session.delete(deployment)

    # Updates nobody finished or cancelled, and versions replaced by an update.
    # Each folder is only let go if the row still has it, as the API may have
    # changed the row since it was read, and is then deleted with the others below.
    now = datetime.now(UTC)
    leftovers_query = (
        select(Deployment)
        .where(col(Deployment.state) == DeploymentState.ready)
        .where(
            or_(
                and_(
                    col(Deployment.pending_folder).is_not(None),
                    col(Deployment.expires_at) < now,
                ),
                col(Deployment.retired_at) < now - retire_after,
            )
        )
        .limit(batch_size)
    )
    # Read up front, as each commit expires the rows
    leftovers = [
        (row.slug, row.owner_id, row.pending_folder, row.folder, row.retired_folder)
        for row in (await session.exec(leftovers_query)).all()
    ]
    for slug, owner_id, pending, served, retired in leftovers:
        abandoned = await session.exec(
            update(Deployment)
            .where(col(Deployment.slug) == slug)
            .where(col(Deployment.pending_folder) == pending)
            .where(col(Deployment.expires_at) < now)
            .values(pending_folder=None, pending_size=0, pending_digest=None)
        )
        if abandoned.rowcount and pending != served:
            discard(session, pending, owner_id, now)
        replaced = await session.exec(
            update(Deployment)
            .where(col(Deployment.slug) == slug)
            .where(col(Deployment.retired_folder) == retired)
            .where(col(Deployment.retired_at) < now - retire_after)
            .values(retired_folder=None, retired_at=None, retired_size=0)
        )
        if replaced.rowcount:
            discard(session, retired, owner_id, now)
        await session.commit()

    # Folders let go above, by cancelled uploads, and by sites deleted mid-upload
    discarded_query = (
        select(DiscardedFolder)
        .where(col(DiscardedFolder.delete_after) <= now)
        .limit(batch_size)
    )
    discarded = (await session.exec(discarded_query)).all()
    for folder in discarded:
        await delete_folder(folder.folder)
        await session.delete(folder)

    # CLI sign-ins nobody finished
    await session.exec(
        delete(CliLogin).where(col(CliLogin.expires_at) < datetime.now(UTC))
    )
    await session.commit()
    return len(expired), len(orphaned), len(discarded)


async def main() -> None:
    async with AsyncSession(engine) as session:
        expired, orphaned, discarded = await cleanup(session)
    await engine.dispose()
    logging.getLogger(__name__).info(
        "Removed %d expired deployments, %d orphaned sites, and %d discarded folders",
        expired,
        orphaned,
        discarded,
    )


if __name__ == "__main__":
    asyncio.run(main())
