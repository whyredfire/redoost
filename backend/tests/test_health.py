import pytest
from fastapi.testclient import TestClient

import src.main as api


async def available() -> None:
    return None


async def unavailable() -> None:
    raise ConnectionError


def test_health_when_dependencies_are_available(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(api, "check_storage", available)
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_when_s3_is_unavailable(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(api, "check_storage", unavailable)
    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
