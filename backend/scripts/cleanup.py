import asyncio
import logging
from datetime import UTC, datetime

from sqlmodel import col, delete, exists, not_, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.config import settings
from src.database import engine
from src.models import Deployment, DeploymentState, User
from src.storage import delete_objects, list_slugs

# Caps each run, so a large backlog is cleared over several runs
batch_size = 100


async def cleanup(session: AsyncSession) -> tuple[int, int, int]:
    now = datetime.now(UTC)
    # Unfinished uploads past their window, whose policies can no longer be
    # used, and published sites past their lifetime
    expired_query = (
        select(Deployment)
        .where(
            or_(
                (col(Deployment.state) == DeploymentState.uploading)
                & (col(Deployment.expires_at) < now),
                col(Deployment.available_until) < now,
            )
        )
        .limit(batch_size)
    )
    slugs, result = await asyncio.gather(list_slugs(), session.exec(expired_query))
    expired = result.all()

    # Rows are committed before any upload, so a folder without one is leftover.
    # Listing the bucket before querying for its slugs keeps that true here.
    query = select(Deployment.slug).where(col(Deployment.slug).in_(slugs))
    result = await session.exec(query)
    known = set(result.all())
    orphaned = [slug for slug in slugs if slug not in known][:batch_size]

    stale = [*orphaned, *(deployment.slug for deployment in expired)]
    deletes = [delete_objects(slug) for slug in stale]
    await asyncio.gather(*deletes)
    for deployment in expired:
        await session.delete(deployment)
    await session.flush()

    # Anonymous users without sites can't get back in; newer ones may be publishing
    unused = (
        delete(User)
        .where(col(User.provider).is_(None))
        .where(col(User.created_at) < now - settings.upload_window)
        .where(not_(exists().where(col(Deployment.owner_id) == User.id)))
    )
    result = await session.exec(unused)
    users = result.rowcount
    await session.commit()
    return len(expired), len(orphaned), users


async def main() -> None:
    async with AsyncSession(engine) as session:
        expired, orphaned, users = await cleanup(session)
    await engine.dispose()
    logging.getLogger(__name__).info(
        "Removed %d expired deployments, %d orphaned folders and %d anonymous users",
        expired,
        orphaned,
        users,
    )


if __name__ == "__main__":
    asyncio.run(main())
