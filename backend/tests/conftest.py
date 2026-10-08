import asyncio
import os
import secrets
from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

# Tests never touch the real database
os.environ["REDOOST_DATABASE_URL"] = os.environ.get(
    "REDOOST_TEST_DATABASE_URL", "sqlite+aiosqlite://"
)

# Real values from the environment take precedence, which enables the Garage tests
for name, value in {
    "REDOOST_LOG_LEVEL": "INFO",
    "REDOOST_APP_ORIGIN": "http://localhost:5173",
    "REDOOST_S3_ENDPOINT": "http://127.0.0.1:3900",
    "REDOOST_S3_PUBLIC_ENDPOINT": "http://127.0.0.1:3900",
    "REDOOST_S3_REGION": "garage",
    "REDOOST_S3_BUCKET": "redoost-sites",
    "REDOOST_S3_ACCESS_KEY_ID": "test-key",
    "REDOOST_S3_SECRET_ACCESS_KEY": "test-secret",
    "REDOOST_JWT_SECRET": "test-jwt-secret-that-is-long-enough",
}.items():
    os.environ.setdefault(name, value)
# Tests use dev sign-in; the OIDC tests configure their provider themselves
os.environ.pop("REDOOST_OIDC_ISSUER", None)
os.environ["REDOOST_DEV_SIGN_IN"] = "true"


@pytest.fixture(autouse=True, scope="session")
def database_engine() -> None:
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool

    from src import database
    from src.config import settings

    # asyncpg connections can't cross event loops; in-memory SQLite needs its pool
    if not settings.database_url.startswith("sqlite"):
        database.engine = create_async_engine(settings.database_url, poolclass=NullPool)


async def create_tables() -> None:
    from src.database import engine

    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)


@pytest.fixture
def client() -> Iterator[TestClient]:
    from src.main import app

    # Migrations are checked in test_migrations.py; here the models are enough
    asyncio.run(create_tables())
    with TestClient(app) as test_client:
        yield test_client


async def create_user() -> str:
    from src import database
    from src.auth import create_token
    from src.config import Provider
    from src.models import User

    async with AsyncSession(database.engine, expire_on_commit=False) as session:
        user = User(provider=Provider.google, subject=secrets.token_hex(8))
        session.add(user)
        await session.commit()
    return create_token(user).token


@pytest.fixture
def new_token(client: TestClient) -> Callable[[], str]:
    """Creates a user and returns its token."""
    return lambda: asyncio.run(create_user())


@pytest.fixture
def token(new_token: Callable[[], str]) -> str:
    return new_token()


@pytest.fixture
def run_cleanup() -> Callable[[], tuple[int, int]]:
    from scripts.cleanup import cleanup
    from src.database import engine

    async def run() -> tuple[int, int]:
        async with AsyncSession(engine) as session:
            return await cleanup(session)

    return lambda: asyncio.run(run())
