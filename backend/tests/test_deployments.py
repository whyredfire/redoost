import base64
import hashlib
import re

import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.deployments import content_type

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
    assert body["file_count"] == 4
    assert body["total_size"] == 35
    assert body["token"]


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
