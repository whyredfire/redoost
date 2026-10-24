import asyncio
import base64
import gzip
import hashlib
from collections.abc import Callable, Iterator
from datetime import timedelta
from typing import Any

import boto3
import httpx2
import pytest
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi.testclient import TestClient

from scripts import cleanup
from src import storage
from src.config import settings
from src.storage import check_storage, content_type

FILES = {
    "index.html": b"<h1>Hello from redoost</h1>",
    "assets/app.js": b"console.log('hello')",
    "docs/caf\u00e9 menu.txt": b"spaces and unicode",
}


def digest(content: bytes) -> str:
    return base64.b64encode(hashlib.sha256(content).digest()).decode()


def manifest(files: dict[str, bytes]) -> dict[str, list[dict[str, Any]]]:
    return {
        "files": [
            {"path": path, "size": len(content), "sha256": digest(content)}
            for path, content in files.items()
        ]
    }


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
def deployment(client: TestClient, token: str, s3: Any) -> Iterator[dict[str, Any]]:
    created = client.post(
        "/api/deployments",
        json=manifest(FILES),
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    yield {**created, "token": token}
    objects = s3.list_objects_v2(
        Bucket=settings.s3_bucket, Prefix=f"{created['slug']}/"
    )
    for item in objects.get("Contents", []):
        s3.delete_object(Bucket=settings.s3_bucket, Key=item["Key"])


def key(deployment: dict[str, Any], path: str) -> str:
    """Where a file goes, in the version folder the deployment's uploads go to."""
    upload = deployment["uploads"][0]
    return upload["fields"]["key"].removesuffix(upload["path"]) + path


def upload(
    deployment: dict[str, Any], path: str, content: bytes, **overrides: str
) -> httpx2.Response:
    policy = next(u for u in deployment["uploads"] if u["path"] == path)
    return httpx2.post(
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

        head = stored(s3, key(deployment, path))
        assert head is not None
        assert head["ContentLength"] == len(content)
        assert head["ContentType"] == content_type(path)
        assert head["ChecksumSHA256"] == digest(content)


def test_uploads_gzipped_files(client: TestClient, token: str, s3: Any) -> None:
    content = gzip.compress(FILES["index.html"])
    file = {"path": "index.html", "size": len(content), "sha256": digest(content)}
    created = client.post(
        "/api/deployments",
        json={"files": [{**file, "gzip": True}]},
        headers={"Authorization": f"Bearer {token}"},
    )
    deployment = created.json()
    try:
        # The signed policy requires the header, so it can't be left out
        without = upload(deployment, "index.html", content, **{"Content-Encoding": ""})
        assert without.status_code == 400
        assert upload(deployment, "index.html", content).status_code == 204

        head = stored(s3, key(deployment, "index.html"))
        assert head is not None
        assert head["ContentEncoding"] == "gzip"
        assert head["ContentLength"] == len(content)
    finally:
        s3.delete_object(Bucket=settings.s3_bucket, Key=key(deployment, "index.html"))


def test_replaying_a_policy_is_harmless(deployment: dict[str, Any]) -> None:
    content = FILES["index.html"]

    assert upload(deployment, "index.html", content).status_code == 204
    assert upload(deployment, "index.html", content).status_code == 204


def test_rejects_different_content(deployment: dict[str, Any], s3: Any) -> None:
    content = FILES["index.html"].upper()
    response = upload(deployment, "index.html", content)

    assert response.status_code == 400
    assert stored(s3, key(deployment, "index.html")) is None


def test_rejects_other_keys(deployment: dict[str, Any], s3: Any) -> None:
    content = FILES["index.html"]
    for other in (
        key(deployment, "other.html"),
        # The folder older sites are served from
        f"{deployment['slug']}/index.html",
        "other-slug/index.html",
    ):
        response = upload(deployment, "index.html", content, key=other)

        assert response.status_code == 400
        assert stored(s3, other) is None


def test_rejects_changed_content_type(deployment: dict[str, Any]) -> None:
    response = upload(
        deployment, "index.html", FILES["index.html"], **{"Content-Type": "text/plain"}
    )

    assert response.status_code == 400


def test_rejects_expired_policies(
    client: TestClient, token: str, s3: Any, monkeypatch: pytest.MonkeyPatch
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
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    assert upload(created, "index.html", content).status_code == 400
    assert stored(s3, key(created, "index.html")) is None


def test_completes_once_every_file_is_uploaded(
    client: TestClient, deployment: dict[str, Any]
) -> None:
    url = f"/api/deployments/{deployment['slug']}/complete"
    headers = {"Authorization": f"Bearer {deployment['token']}"}

    upload(deployment, "index.html", FILES["index.html"])
    response = client.post(url, headers=headers, json=manifest(FILES))
    assert response.status_code == 409
    assert response.json()["detail"] == f"1 of {len(FILES)} files uploaded"

    for path, content in FILES.items():
        assert upload(deployment, path, content).status_code == 204
    response = client.post(url, headers=headers, json=manifest(FILES))
    assert response.status_code == 200
    assert response.json()["state"] == "ready"


def test_completion_counts_the_stored_sizes(
    client: TestClient, deployment: dict[str, Any]
) -> None:
    url = f"/api/deployments/{deployment['slug']}/complete"
    headers = {"Authorization": f"Bearer {deployment['token']}"}
    for path, content in FILES.items():
        upload(deployment, path, content)

    # Same paths and checksums, but sizes that would hide the files from the quota
    understated = manifest(FILES)
    for file in understated["files"]:
        file["size"] = 0
    response = client.post(url, headers=headers, json=understated)
    assert response.status_code == 409

    response = client.post(url, headers=headers, json=manifest(FILES))
    assert response.status_code == 200
    assert response.json()["total_size"] == sum(map(len, FILES.values()))


def keys(s3: Any, prefix: str) -> list[str]:
    objects = s3.list_objects_v2(Bucket=settings.s3_bucket, Prefix=prefix)
    return sorted(item["Key"] for item in objects.get("Contents", []))


def only_sites(monkeypatch: pytest.MonkeyPatch, *slugs: str) -> None:
    """Keeps cleanup to these sites, as other sites in the bucket look orphaned here."""

    async def list_slugs() -> list[str]:
        return [slug for slug in await storage.list_slugs() if slug in slugs]

    monkeypatch.setattr(cleanup, "list_slugs", list_slugs)


def test_updates_switch_folders_once_complete(
    client: TestClient,
    deployment: dict[str, Any],
    s3: Any,
    run_cleanup: Callable[[], tuple[int, int, int]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    slug = deployment["slug"]
    url = f"/api/deployments/{slug}"
    headers = {"Authorization": f"Bearer {deployment['token']}"}
    for path, content in FILES.items():
        upload(deployment, path, content)
    client.post(f"{url}/complete", headers=headers, json=manifest(FILES))
    served = key(deployment, "")
    stored_files = client.get(f"{url}/files", headers=headers).json()
    assert {file["path"]: file["sha256"] for file in stored_files} == {
        path: digest(content) for path, content in FILES.items()
    }

    files = {
        "index.html": b"<h1>Updated</h1>",
        "assets/app.js": FILES["assets/app.js"],
        "new.txt": b"new file",
    }
    updated = client.put(url, headers=headers, json=manifest(files)).json()
    assert [upload["path"] for upload in updated["uploads"]] == [
        "index.html",
        "new.txt",
    ]
    response = client.post(f"{url}/complete", headers=headers, json=manifest(files))
    assert response.json()["detail"] == "1 of 3 files uploaded"

    for path in ("index.html", "new.txt"):
        assert upload(updated, path, files[path]).status_code == 204
    # Visitors still get the old files until the update completes
    head = stored(s3, f"{served}index.html")
    assert head is not None and head["ChecksumSHA256"] == digest(FILES["index.html"])

    response = client.post(f"{url}/complete", headers=headers, json=manifest(files))
    assert response.status_code == 200
    assert response.json()["file_count"] == 3
    folder = key(updated, "")
    # The unchanged file is copied into the new version
    assert keys(s3, folder) == sorted(f"{folder}{path}" for path in files)
    head = stored(s3, f"{folder}index.html")
    assert head is not None and head["ChecksumSHA256"] == digest(files["index.html"])
    root = client.get(f"/internal/sites/{slug}").headers["X-Site-Root"]
    assert root == "/" + folder.removesuffix("/")

    # The old version goes once Nginx can no longer have it cached
    assert keys(s3, served)
    only_sites(monkeypatch, slug)
    monkeypatch.setattr(cleanup, "retire_after", timedelta(0))
    run_cleanup()
    assert keys(s3, served) == []
    assert keys(s3, f"{slug}/") == keys(s3, folder)


def test_cancelled_updates_leave_nothing_behind(
    client: TestClient, deployment: dict[str, Any], s3: Any
) -> None:
    slug = deployment["slug"]
    url = f"/api/deployments/{slug}"
    headers = {"Authorization": f"Bearer {deployment['token']}"}
    for path, content in FILES.items():
        upload(deployment, path, content)
    client.post(f"{url}/complete", headers=headers, json=manifest(FILES))
    before = keys(s3, f"{slug}/")

    files = {**FILES, "index.html": b"<h1>Never finished</h1>", "big.bin": b"x" * 4096}
    updated = client.put(url, headers=headers, json=manifest(files)).json()
    for path in ("index.html", "big.bin"):
        assert upload(updated, path, files[path]).status_code == 204
    assert keys(s3, f"{slug}/") != before

    assert client.post(f"{url}/cancel", headers=headers).status_code == 204
    assert keys(s3, f"{slug}/") == before
    head = stored(s3, key(deployment, "index.html"))
    assert head is not None and head["ChecksumSHA256"] == digest(FILES["index.html"])


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


def test_cleanup_removes_orphaned_files(
    deployment: dict[str, Any],
    s3: Any,
    run_cleanup: Callable[[], tuple[int, int, int]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    upload(deployment, "index.html", FILES["index.html"])
    s3.put_object(
        Bucket=settings.s3_bucket, Key="orphan-test-0000/index.html", Body=b""
    )

    only_sites(monkeypatch, deployment["slug"], "orphan-test-0000")
    run_cleanup()
    assert stored(s3, "orphan-test-0000/index.html") is None
    assert stored(s3, key(deployment, "index.html")) is not None
