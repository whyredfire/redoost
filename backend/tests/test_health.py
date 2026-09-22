import asyncio
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

import src.main as api


class AvailableStorage:
    async def check_connection(self) -> None:
        return None


class UnavailableStorage:
    async def check_connection(self) -> None:
        raise ConnectionError


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    monkeypatch.setattr(api, "engine", engine)
    with TestClient(api.app) as test_client:
        yield test_client
    asyncio.run(engine.dispose())


def test_health_when_dependencies_are_available(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(api, "storage", AvailableStorage())
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_when_s3_is_unavailable(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(api, "storage", UnavailableStorage())
    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
