import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import ARRAY, CTE, Insert, String, any_, literal
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import col, delete, select, update
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql.sqltypes import UTCDateTime

from src.database import engine
from src.deployments import retire_after
from src.models import (
    CliLogin,
    Deployment,
    DeploymentState,
    DiscardedFolder,
    VersionFiles,
)
from src.storage import delete_folder, delete_sites, slug_pages

# Caps each run, so a large backlog is cleared over several runs
batch_size = 100


def queue(cleared: CTE, folder: str, now: datetime, *where: Any) -> Insert:
    """Queues the folders an UPDATE ... RETURNING took off their rows for deletion."""
    rows = select(
        cleared.c[folder],
        cleared.c.owner_id,
        literal(0),
        literal(now, UTCDateTime()),
    ).where(cleared.c[folder].is_not(None), *where)
    return (
        insert(DiscardedFolder)
        .from_select(["folder", "owner_id", "size", "delete_after"], rows)
        .on_conflict_do_nothing()
    )


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
        query = select(Deployment.slug).where(
            col(Deployment.slug) == any_(literal(slugs, ARRAY(String)))
        )
        known = set((await session.exec(query)).all())
        orphaned.extend(slug for slug in slugs if slug not in known)
        if len(orphaned) >= batch_size:
            break
    orphaned = orphaned[:batch_size]

    await delete_sites([*orphaned, *(deployment.slug for deployment in expired)])
    for deployment in expired:
        await session.delete(deployment)

    # Updates nobody finished or cancelled, and versions replaced by an update. Each
    # statement takes the folders off their rows and queues them in one go, skipping
    # rows the API has locked to change them.
    now = datetime.now(UTC)
    abandoned = (
        select(Deployment.slug, Deployment.owner_id, Deployment.pending_folder)
        .add_columns(col(Deployment.folder).label("served"))
        .where(col(Deployment.state) == DeploymentState.ready)
        .where(col(Deployment.pending_folder).is_not(None))
        .where(col(Deployment.expires_at) < now)
        .limit(batch_size)
        .with_for_update(skip_locked=True)
        .subquery()
    )
    cleared = (
        update(Deployment)
        .where(col(Deployment.slug) == abandoned.c.slug)
        .values(pending_folder=None, pending_size=0, pending_digest=None)
        .returning(abandoned.c.pending_folder, abandoned.c.owner_id, abandoned.c.served)
        .cte("cleared")
    )
    # Sites from before versions uploaded into the folder they serve
    await session.exec(
        queue(
            cleared,
            "pending_folder",
            now,
            cleared.c.pending_folder.is_distinct_from(cleared.c.served),
        )
    )
    replaced = (
        select(Deployment.slug, Deployment.owner_id, Deployment.retired_folder)
        .where(col(Deployment.retired_at) < now - retire_after)
        .limit(batch_size)
        .with_for_update(skip_locked=True)
        .subquery()
    )
    cleared = (
        update(Deployment)
        .where(col(Deployment.slug) == replaced.c.slug)
        .values(retired_folder=None, retired_at=None, retired_size=0)
        .returning(replaced.c.retired_folder, replaced.c.owner_id)
        .cte("cleared")
    )
    await session.exec(queue(cleared, "retired_folder", now))
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
    await session.exec(
        delete(VersionFiles).where(
            col(VersionFiles.folder).in_([folder.folder for folder in discarded])
        )
    )

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
