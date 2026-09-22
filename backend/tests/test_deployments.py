import base64
import hashlib
import json
import re
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from src import deployments
from src.config import settings
from src.storage import content_type

URL = "/api/deployments"
SHA256 = base64.b64encode(hashlib.sha256(b"").digest()).decode()


def manifest(*paths: str, size: int = 1) -> dict[str, list[dict[str, str | int]]]:
    return {"files": [{"path": path, "size": size, "sha256": SHA256} for path in paths]}


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_create_deployment(client: TestClient) -> None:
    files = [
        {"path": "index.html", "size": 10, "sha256": SHA256},
        {"path": "assets/app.js", "size": 20, "sha256": SHA256},
        {"path": ".well-known/security.txt", "size": 0, "sha256": SHA256},
        {"path": "docs/café menu.html", "size": 5, "sha256": SHA256},
    ]
    response = client.post(URL, json={"files": files})

    assert response.status_code == 201
    body = response.json()
    assert re.fullmatch(r"[a-z]+(-[a-z]+)+-[0-9a-f]{4}", body["slug"])
    assert len(body["slug"]) <= 63
    assert body["state"] == "uploading"
    assert datetime.fromisoformat(body["expires_at"]) > datetime.now(UTC)
    assert body["file_count"] == 4
    assert body["total_size"] == 35
    assert body["token"]


def test_create_deployment_signs_one_policy_per_file(client: TestClient) -> None:
    body = client.post(URL, json=manifest("index.html", "assets/app.js", size=5)).json()

    assert body["upload_url"] == f"{settings.s3_public_endpoint}{settings.s3_bucket}"
    assert [upload["path"] for upload in body["uploads"]] == [
        "index.html",
        "assets/app.js",
    ]

    fields = body["uploads"][1]["fields"]
    assert fields["key"] == f"{body['slug']}/assets/app.js"
    assert fields["Content-Type"] == "text/javascript"
    assert fields["x-amz-checksum-sha256"] == SHA256

    policy = json.loads(base64.b64decode(fields["policy"]))
    for condition in (
        {"bucket": settings.s3_bucket},
        {"key": fields["key"]},
        {"Content-Type": "text/javascript"},
        {"x-amz-checksum-algorithm": "SHA256"},
        {"x-amz-checksum-sha256": SHA256},
        ["content-length-range", 5, 5],
    ):
        assert condition in policy["conditions"]
    expires_in = datetime.fromisoformat(policy["expiration"]) - datetime.now(UTC)
    assert timedelta(minutes=59) < expires_in <= settings.upload_window


def test_slugs_are_unique(client: TestClient) -> None:
    slugs = {
        client.post(URL, json=manifest("index.html")).json()["slug"] for _ in range(20)
    }

    assert len(slugs) == 20


def test_read_deployment_requires_its_token(client: TestClient) -> None:
    created = client.post(URL, json=manifest("index.html")).json()
    url = f"{URL}/{created['slug']}"

    assert client.get(url).status_code == 401
    assert client.get(url, headers=bearer("wrong")).status_code == 403

    response = client.get(url, headers=bearer(created["token"]))
    assert response.status_code == 200
    assert response.json()["slug"] == created["slug"]
    assert "token" not in response.json()


def test_read_unknown_deployment(client: TestClient) -> None:
    response = client.get(f"{URL}/missing-slug", headers=bearer("token"))

    assert response.status_code == 404


@pytest.mark.parametrize(
    "path",
    [
        "/index.html",
        "../index.html",
        "assets/../index.html",
        "./index.html",
        "assets//app.js",
        "assets/",
        "assets\\app.js",
        "assets/app\n.js",
        "x" * 901,
    ],
)
def test_rejects_invalid_paths(client: TestClient, path: str) -> None:
    response = client.post(URL, json=manifest("index.html", path))

    assert response.status_code == 422


@pytest.mark.parametrize(
    "body",
    [
        {"files": []},
        manifest("index.html", "index.html"),
        manifest("docs/index.html"),
        manifest("index.html", size=-1),
    ],
    ids=["empty", "duplicate", "no-root-index", "negative-size"],
)
def test_rejects_invalid_manifests(
    client: TestClient, body: dict[str, list[dict[str, str | int]]]
) -> None:
    assert client.post(URL, json=body).status_code == 422


@pytest.mark.parametrize(
    "sha256",
    [
        "",
        hashlib.sha256(b"").hexdigest(),
        SHA256.rstrip("="),
        SHA256[:-2] + "!=",
        base64.b64encode(hashlib.sha1(b"").digest()).decode(),
    ],
    ids=["empty", "hex", "unpadded", "invalid-char", "sha1"],
)
def test_rejects_invalid_checksums(client: TestClient, sha256: str) -> None:
    body = {"files": [{"path": "index.html", "size": 1, "sha256": sha256}]}

    assert client.post(URL, json=body).status_code == 422


def test_enforces_limits(client: TestClient) -> None:
    too_many = manifest(
        "index.html", *(f"{i}.txt" for i in range(settings.max_deployment_files))
    )
    too_large = manifest("index.html", size=settings.max_file_size + 1)
    count = settings.max_deployment_size // settings.max_file_size + 1
    too_much = manifest(
        "index.html",
        *(f"{i}.bin" for i in range(count - 1)),
        size=settings.max_file_size,
    )

    for body in (too_many, too_large, too_much):
        assert client.post(URL, json=body).status_code == 422


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("index.html", "text/html"),
        ("assets/app.js", "text/javascript"),
        ("fonts/inter.woff2", "font/woff2"),
        ("archive.tar.gz", "application/octet-stream"),
        ("LICENSE", "application/octet-stream"),
    ],
)
def test_content_type(path: str, expected: str) -> None:
    assert content_type(path) == expected


def complete(client: TestClient, created: dict[str, str]) -> Response:
    return client.post(
        f"{URL}/{created['slug']}/complete", headers=bearer(created["token"])
    )


def uploaded(count: int) -> Callable[[str], Awaitable[int]]:
    async def count_objects(slug: str) -> int:
        return count

    return count_objects


def test_complete_marks_deployment_ready(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = client.post(URL, json=manifest("index.html", "app.js")).json()
    monkeypatch.setattr(deployments, "count_objects", uploaded(2))

    response = complete(client, created)
    assert response.status_code == 200
    assert response.json()["state"] == "ready"

    # Completing again returns the ready deployment without listing objects
    monkeypatch.setattr(deployments, "count_objects", uploaded(0))
    assert complete(client, created).json()["state"] == "ready"


def test_complete_rejects_missing_files(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = client.post(URL, json=manifest("index.html", "app.js")).json()
    monkeypatch.setattr(deployments, "count_objects", uploaded(1))

    response = complete(client, created)
    assert response.status_code == 409
    assert response.json()["detail"] == "1 of 2 files uploaded"


def test_complete_rejects_closed_upload_window(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "upload_window", timedelta(seconds=-1))
    created = client.post(URL, json=manifest("index.html")).json()
    monkeypatch.setattr(deployments, "count_objects", uploaded(1))

    assert complete(client, created).status_code == 410


def test_complete_requires_its_token(client: TestClient) -> None:
    created = client.post(URL, json=manifest("index.html")).json()

    assert complete(client, {**created, "token": "wrong"}).status_code == 403
