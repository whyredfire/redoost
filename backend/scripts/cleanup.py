import asyncio
import logging
from datetime import UTC, datetime

from sqlmodel import and_, col, delete, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.database import engine
from src.deployments import discard_retired, retire_after
from src.models import CliLogin, Deployment, DeploymentState
from src.storage import delete_folder, delete_sites, slug_pages

# Caps each run, so a large backlog is cleared over several runs
batch_size = 100


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

    # Updates nobody finished or cancelled, and versions replaced by an update
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
    leftovers = (await session.exec(leftovers_query)).all()
    for deployment in leftovers:
        if deployment.pending_folder and deployment.expires_at < now:
            if deployment.pending_folder != deployment.folder:
                await delete_folder(deployment.pending_folder)
            deployment.pending_folder = None
            deployment.pending_size = 0
        if deployment.retired_at and deployment.retired_at < now - retire_after:
            await discard_retired(deployment)
        session.add(deployment)
    # CLI sign-ins nobody finished
    await session.exec(
        delete(CliLogin).where(col(CliLogin.expires_at) < datetime.now(UTC))
    )
    await session.commit()
    return len(expired), len(orphaned), len(leftovers)


async def main() -> None:
    async with AsyncSession(engine) as session:
        expired, orphaned, leftovers = await cleanup(session)
    await engine.dispose()
    logging.getLogger(__name__).info(
        "Removed %d expired deployments, %d orphaned folders, and the leftover files "
        "of %d sites",
        expired,
        orphaned,
        leftovers,
    )


if __name__ == "__main__":
    asyncio.run(main())
