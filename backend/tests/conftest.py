import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

os.environ.update(
    {
        "REDOOST_LOG_LEVEL": "INFO",
        "REDOOST_DATABASE_URL": "sqlite+aiosqlite://",
        "REDOOST_S3_ENDPOINT": "http://127.0.0.1:3900",
        "REDOOST_S3_PUBLIC_ENDPOINT": "http://127.0.0.1:3900",
        "REDOOST_S3_REGION": "garage",
        "REDOOST_S3_BUCKET": "redoost-sites",
        "REDOOST_S3_ACCESS_KEY_ID": "test-key",
        "REDOOST_S3_SECRET_ACCESS_KEY": "test-secret",
    }
)


@pytest.fixture
def client() -> Iterator[TestClient]:
    from src.main import app

    with TestClient(app) as test_client:
        yield test_client
