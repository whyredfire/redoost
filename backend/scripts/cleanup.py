import asyncio
import logging
from datetime import UTC, datetime

from sqlmodel import col, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.database import engine
from src.models import Deployment, DeploymentState
from src.storage import delete_objects, list_slugs

# Caps each run, so a large backlog is cleared over several runs
batch_size = 100


async def cleanup(session: AsyncSession) -> tuple[int, int]:
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
    await asyncio.gather(*(delete_objects(slug) for slug in stale))
    for deployment in expired:
        await session.delete(deployment)
    await session.commit()
    return len(expired), len(orphaned)


async def main() -> None:
    async with AsyncSession(engine) as session:
        expired, orphaned = await cleanup(session)
    await engine.dispose()
    logging.getLogger(__name__).info(
        "Removed %d expired deployments and %d orphaned folders", expired, orphaned
    )


if __name__ == "__main__":
    asyncio.run(main())
