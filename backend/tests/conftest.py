import asyncio
import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel

# Tests never touch the real database
os.environ["REDOOST_DATABASE_URL"] = "sqlite+aiosqlite://"

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
}.items():
    os.environ.setdefault(name, value)


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
