import pytest
from fastapi.testclient import TestClient

import src.main as api


class AvailableStorage:
    async def check_connection(self) -> None:
        return None


class UnavailableStorage:
    async def check_connection(self) -> None:
        raise ConnectionError


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
