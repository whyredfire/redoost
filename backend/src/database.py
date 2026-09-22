from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from .config import settings

engine = create_async_engine(settings.database_url)


async def create_tables() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session


async def check_database() -> None:
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))
