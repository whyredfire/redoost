import asyncio
import base64
import hashlib
from collections.abc import Iterator
from datetime import timedelta
from typing import Any

import boto3
import httpx
import pytest
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi.testclient import TestClient

from src.config import settings
from src.storage import check_storage, content_type

FILES = {
    "index.html": b"<h1>Hello from redoost</h1>",
    "assets/app.js": b"console.log('hello')",
    "docs/caf\u00e9 menu.txt": b"spaces and unicode",
}


def digest(content: bytes) -> str:
    return base64.b64encode(hashlib.sha256(content).digest()).decode()


# Checked once, so the tests skip quickly when Garage is unreachable
@pytest.fixture(scope="session")
def s3() -> Any:
    try:
        asyncio.run(check_storage())
    except BotoCoreError, ClientError:
        pytest.skip("Garage isn't reachable, run with --env-file ../.env")
    return boto3.client(
        "s3",
        endpoint_url=str(settings.s3_endpoint),
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key.get_secret_value(),
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


@pytest.fixture
def deployment(client: TestClient, s3: Any) -> Iterator[dict[str, Any]]:
    files = [
        {"path": path, "size": len(content), "sha256": digest(content)}
        for path, content in FILES.items()
    ]
    created = client.post("/api/deployments", json={"files": files}).json()
    yield created
    objects = s3.list_objects_v2(
        Bucket=settings.s3_bucket, Prefix=f"{created['slug']}/"
    )
    for item in objects.get("Contents", []):
        s3.delete_object(Bucket=settings.s3_bucket, Key=item["Key"])


def upload(
    deployment: dict[str, Any], path: str, content: bytes, **overrides: str
) -> httpx.Response:
    policy = next(u for u in deployment["uploads"] if u["path"] == path)
    return httpx.post(
        deployment["upload_url"],
        data={**policy["fields"], **overrides},
        files={"file": (path, content)},
    )


def stored(s3: Any, key: str) -> dict[str, Any] | None:
    try:
        return s3.head_object(
            Bucket=settings.s3_bucket, Key=key, ChecksumMode="ENABLED"
        )
    except ClientError:
        return None


def test_uploads_matching_files(deployment: dict[str, Any], s3: Any) -> None:
    for path, content in FILES.items():
        assert upload(deployment, path, content).status_code == 204

        head = stored(s3, f"{deployment['slug']}/{path}")
        assert head is not None
        assert head["ContentLength"] == len(content)
        assert head["ContentType"] == content_type(path)
        assert head["ChecksumSHA256"] == digest(content)


def test_replaying_a_policy_is_harmless(deployment: dict[str, Any]) -> None:
    content = FILES["index.html"]

    assert upload(deployment, "index.html", content).status_code == 204
    assert upload(deployment, "index.html", content).status_code == 204


def test_rejects_different_content(deployment: dict[str, Any], s3: Any) -> None:
    content = FILES["index.html"].upper()
    response = upload(deployment, "index.html", content)

    assert response.status_code == 400
    assert stored(s3, f"{deployment['slug']}/index.html") is None


def test_rejects_other_keys(deployment: dict[str, Any], s3: Any) -> None:
    content = FILES["index.html"]
    for key in (f"{deployment['slug']}/other.html", "other-slug/index.html"):
        response = upload(deployment, "index.html", content, key=key)

        assert response.status_code == 400
        assert stored(s3, key) is None


def test_rejects_changed_content_type(deployment: dict[str, Any]) -> None:
    response = upload(
        deployment, "index.html", FILES["index.html"], **{"Content-Type": "text/plain"}
    )

    assert response.status_code == 400


def test_rejects_expired_policies(
    client: TestClient, s3: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "upload_window", timedelta(seconds=-1))
    content = FILES["index.html"]
    created = client.post(
        "/api/deployments",
        json={
            "files": [
                {"path": "index.html", "size": len(content), "sha256": digest(content)}
            ]
        },
    ).json()

    assert upload(created, "index.html", content).status_code == 400
    assert stored(s3, f"{created['slug']}/index.html") is None


def test_completes_once_every_file_is_uploaded(
    client: TestClient, deployment: dict[str, Any]
) -> None:
    url = f"/api/deployments/{deployment['slug']}/complete"
    headers = {"Authorization": f"Bearer {deployment['token']}"}

    upload(deployment, "index.html", FILES["index.html"])
    response = client.post(url, headers=headers)
    assert response.status_code == 409
    assert response.json()["detail"] == f"1 of {len(FILES)} files uploaded"

    for path, content in FILES.items():
        assert upload(deployment, path, content).status_code == 204
    response = client.post(url, headers=headers)
    assert response.status_code == 200
    assert response.json()["state"] == "ready"


def test_delete_removes_uploaded_files(
    client: TestClient, deployment: dict[str, Any], s3: Any
) -> None:
    for path, content in FILES.items():
        upload(deployment, path, content)

    response = client.delete(
        f"/api/deployments/{deployment['slug']}",
        headers={"Authorization": f"Bearer {deployment['token']}"},
    )
    assert response.status_code == 204
    objects = s3.list_objects_v2(
        Bucket=settings.s3_bucket, Prefix=f"{deployment['slug']}/"
    )
    assert objects["KeyCount"] == 0
