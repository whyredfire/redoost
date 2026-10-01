import asyncio

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel

import src.models  # noqa: F401 - registers the tables on SQLModel.metadata
from src.config import settings


def run_migrations(connection: Connection) -> None:
    # SQLite can't alter most columns, so batch mode recreates the table instead
    context.configure(
        connection=connection,
        target_metadata=SQLModel.metadata,
        render_as_batch=True,
    )
    with context.begin_transaction():
        # API replicas all migrate on start, so they wait for each other
        if connection.dialect.name == "postgresql":
            connection.execute(text("SELECT pg_advisory_xact_lock(7562105)"))
        context.run_migrations()


async def main() -> None:
    engine = create_async_engine(settings.database_url, poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(run_migrations)
    await engine.dispose()


asyncio.run(main())
