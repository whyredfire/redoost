from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from .config import settings

engine = create_async_engine(settings.database_url)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session


Session = Annotated[AsyncSession, Depends(get_session)]


async def check_database() -> None:
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))
