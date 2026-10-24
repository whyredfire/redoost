import base64
import hashlib
import json
import re
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response
from pydantic import ByteSize

from scripts import cleanup
from src import deployments
from src.config import settings
from src.storage import StoredObject, content_type

URL = "/api/deployments"
SHA256 = base64.b64encode(hashlib.sha256(b"").digest()).decode()
OTHER_SHA256 = base64.b64encode(hashlib.sha256(b"other").digest()).decode()


def manifest(*paths: str, size: int = 1) -> dict[str, list[dict[str, str | int]]]:
    return {"files": [{"path": path, "size": size, "sha256": SHA256} for path in paths]}


# Records what would change in storage; test_uploads.py covers Garage itself
@pytest.fixture(autouse=True)
def storage(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, ...]]:
    calls: list[tuple[str, ...]] = []

    async def delete_folder(folder: str) -> None:
        calls.append(("delete folder", folder))

    async def delete_paths(folder: str, paths: list[str]) -> None:
        if paths:
            calls.append(("delete paths", folder, *paths))

    async def copy_files(source: str, target: str, paths: list[str]) -> None:
        calls.append(("copy", source, target, *paths))

    async def delete_site(slug: str) -> None:
        calls.append(("delete site", slug))

    async def list_slugs() -> list[str]:
        return []

    for module in (deployments, cleanup):
        monkeypatch.setattr(module, "delete_folder", delete_folder)
        monkeypatch.setattr(module, "delete_site", delete_site)
    monkeypatch.setattr(deployments, "delete_paths", delete_paths)
    monkeypatch.setattr(deployments, "copy_files", copy_files)
    monkeypatch.setattr(cleanup, "list_slugs", list_slugs)
    return calls


def folder_of(response: dict[str, Any]) -> str:
    """The version folder a response's uploads go to."""
    upload = response["uploads"][0]
    return upload["fields"]["key"].removesuffix(upload["path"])


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def create(client: TestClient, token: str, *paths: str) -> dict[str, str]:
    response = client.post(URL, json=manifest(*paths), headers=bearer(token))
    return {**response.json(), "token": token}


def test_create_deployment(client: TestClient, token: str) -> None:
    files = [
        {"path": "index.html", "size": 10, "sha256": SHA256},
        {"path": "assets/app.js", "size": 20, "sha256": SHA256},
        {"path": ".well-known/security.txt", "size": 0, "sha256": SHA256},
        {"path": "docs/café menu.html", "size": 5, "sha256": SHA256},
    ]
    response = client.post(URL, json={"files": files}, headers=bearer(token))

    assert response.status_code == 201
    body = response.json()
    assert re.fullmatch(r"[a-z]+(-[a-z]+)+-[0-9a-f]{4}", body["slug"])
    assert len(body["slug"]) <= 63
    assert body["state"] == "uploading"
    assert datetime.fromisoformat(body["expires_at"]) > datetime.now(UTC)
    assert body["file_count"] == 4
    assert body["total_size"] == 35
    assert "token" not in body and "owner_id" not in body


def test_create_deployment_requires_a_user(client: TestClient) -> None:
    assert client.post(URL, json=manifest("index.html")).status_code == 401
    response = client.post(URL, json=manifest("index.html"), headers=bearer("x"))
    assert response.status_code == 401


def test_create_deployment_signs_one_policy_per_file(
    client: TestClient, token: str
) -> None:
    body = client.post(
        URL, json=manifest("index.html", "assets/app.js", size=5), headers=bearer(token)
    ).json()

    assert body["upload_url"] == f"{settings.s3_public_endpoint}{settings.s3_bucket}"
    assert [upload["path"] for upload in body["uploads"]] == [
        "index.html",
        "assets/app.js",
    ]

    fields = body["uploads"][1]["fields"]
    assert re.fullmatch(
        rf"{body['slug']}/v-[0-9a-f]{{12}}/assets/app.js", fields["key"]
    )
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


def test_signs_content_encoding_for_gzipped_files(
    client: TestClient, token: str
) -> None:
    files = [
        {"path": "index.html", "size": 5, "sha256": SHA256, "gzip": True},
        {"path": "logo.png", "size": 5, "sha256": SHA256},
    ]
    uploads = client.post(URL, json={"files": files}, headers=bearer(token)).json()[
        "uploads"
    ]

    gzipped, plain = (upload["fields"] for upload in uploads)
    assert gzipped["Content-Encoding"] == "gzip"
    policy = json.loads(base64.b64decode(gzipped["policy"]))
    assert {"Content-Encoding": "gzip"} in policy["conditions"]
    assert "Content-Encoding" not in plain


def test_slugs_are_unique(client: TestClient, token: str) -> None:
    slugs = {create(client, token, "index.html")["slug"] for _ in range(20)}

    assert len(slugs) == 20


def test_read_deployment_requires_its_owner(
    client: TestClient, token: str, new_token: Callable[[], str]
) -> None:
    created = create(client, token, "index.html")
    url = f"{URL}/{created['slug']}"

    assert client.get(url).status_code == 401
    assert client.get(url, headers=bearer("wrong")).status_code == 401
    assert client.get(url, headers=bearer(new_token())).status_code == 403

    response = client.get(url, headers=bearer(created["token"]))
    assert response.status_code == 200
    assert response.json()["slug"] == created["slug"]
    assert "token" not in response.json()


def test_read_limits(client: TestClient) -> None:
    response = client.get(f"{URL}/limits")

    assert response.status_code == 200
    assert response.json() == {
        "max_file_size": settings.max_file_size,
        "max_deployment_size": settings.max_deployment_size,
        "max_deployment_files": settings.max_deployment_files,
    }


def test_read_unknown_deployment(client: TestClient, token: str) -> None:
    response = client.get(f"{URL}/missing-slug", headers=bearer(token))

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
def test_rejects_invalid_paths(client: TestClient, token: str, path: str) -> None:
    response = client.post(
        URL, json=manifest("index.html", path), headers=bearer(token)
    )

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
    client: TestClient, token: str, body: dict[str, list[dict[str, str | int]]]
) -> None:
    assert client.post(URL, json=body, headers=bearer(token)).status_code == 422


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
def test_rejects_invalid_checksums(client: TestClient, token: str, sha256: str) -> None:
    body = {"files": [{"path": "index.html", "size": 1, "sha256": sha256}]}

    assert client.post(URL, json=body, headers=bearer(token)).status_code == 422


def test_enforces_limits(client: TestClient, token: str) -> None:
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
        assert client.post(URL, json=body, headers=bearer(token)).status_code == 422


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


def complete(client: TestClient, created: dict[str, str], *paths: str) -> Response:
    return client.post(
        f"{URL}/{created['slug']}/complete",
        headers=bearer(created["token"]),
        json=manifest(*(paths or ("index.html",))),
    )


def stored(
    *paths: str, sha256: str = SHA256, size: int = 1
) -> Callable[[str], Awaitable[dict[str, StoredObject]]]:
    async def read_objects(slug: str) -> dict[str, StoredObject]:
        return {path: StoredObject(sha256=sha256, size=size) for path in paths}

    return read_objects


def test_complete_marks_deployment_ready(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = create(client, token, "index.html", "app.js")
    monkeypatch.setattr(deployments, "read_objects", stored("index.html", "app.js"))

    response = complete(client, created, "index.html", "app.js")
    assert response.status_code == 200
    assert response.json()["state"] == "ready"
    assert datetime.fromisoformat(response.json()["expires_at"]) <= datetime.now(UTC)

    # Repeating a completion succeeds while the files still match
    assert complete(client, created, "index.html", "app.js").status_code == 200
    assert complete(client, created).status_code == 410


@pytest.mark.parametrize(
    "checksums",
    [stored("index.html"), stored("index.html", "app.js", sha256=OTHER_SHA256)],
    ids=["missing", "different"],
)
def test_complete_rejects_missing_files(
    client: TestClient,
    token: str,
    monkeypatch: pytest.MonkeyPatch,
    checksums: Callable[[str], Awaitable[dict[str, StoredObject]]],
) -> None:
    created = create(client, token, "index.html", "app.js")
    monkeypatch.setattr(deployments, "read_objects", checksums)

    response = complete(client, created, "index.html", "app.js")
    assert response.status_code == 409
    assert response.json()["detail"].endswith("of 2 files uploaded")


def test_complete_rejects_understated_sizes(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = create(client, token, "index.html")
    monkeypatch.setattr(deployments, "read_objects", stored("index.html", size=10))
    url = f"{URL}/{created['slug']}"

    # The checksum matches, but the stored file is bigger than declared
    response = client.post(
        f"{url}/complete", headers=bearer(token), json=manifest("index.html", size=0)
    )
    assert response.status_code == 409
    assert client.get(url, headers=bearer(token)).json()["state"] == "uploading"

    response = client.post(
        f"{url}/complete", headers=bearer(token), json=manifest("index.html", size=10)
    )
    assert response.json()["total_size"] == 10


def test_complete_checks_storage_again(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = create(client, token, "index.html")
    other = create(client, token, "index.html")
    monkeypatch.setattr(deployments, "read_objects", stored("index.html"))
    complete(client, other)
    # As if the other site had finished first and used up what's left
    monkeypatch.setattr(settings, "max_account_size", ByteSize(1))

    response = complete(client, created)
    assert response.status_code == 403
    assert response.json()["detail"] == "Your sites can use up to 1B in total"


def test_complete_rejects_closed_upload_window(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "upload_window", timedelta(seconds=-1))
    created = create(client, token, "index.html")
    monkeypatch.setattr(deployments, "read_objects", stored("index.html"))

    assert complete(client, created).status_code == 410


def test_complete_requires_its_owner(
    client: TestClient, token: str, new_token: Callable[[], str]
) -> None:
    created = create(client, token, "index.html")

    assert complete(client, {**created, "token": new_token()}).status_code == 403


def published(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch, *paths: str
) -> dict[str, str]:
    monkeypatch.setattr(deployments, "read_objects", stored(*paths))
    created = create(client, token, *paths)
    complete(client, created, *paths)
    return created


def update(client: TestClient, created: dict[str, str], *paths: str) -> Response:
    return client.put(
        f"{URL}/{created['slug']}",
        headers=bearer(created["token"]),
        json=manifest(*paths),
    )


def cancel(client: TestClient, created: dict[str, str]) -> Response:
    return client.post(
        f"{URL}/{created['slug']}/cancel", headers=bearer(created["token"])
    )


def test_read_files(
    client: TestClient,
    token: str,
    new_token: Callable[[], str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created = published(client, token, monkeypatch, "index.html", "app.js")
    url = f"{URL}/{created['slug']}/files"

    assert client.get(url, headers=bearer(new_token())).status_code == 403
    response = client.get(url, headers=bearer(token))
    assert response.json() == [
        {"path": "index.html", "sha256": SHA256},
        {"path": "app.js", "sha256": SHA256},
    ]


def test_update_signs_only_new_and_changed_files(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = published(client, token, monkeypatch, "index.html", "app.js", "old.js")

    async def read_objects(slug: str) -> dict[str, StoredObject]:
        return {
            "index.html": StoredObject(sha256=SHA256, size=1),
            "app.js": StoredObject(sha256=OTHER_SHA256, size=1),
            # Same checksum, but not the size the manifest declares
            "about.html": StoredObject(sha256=SHA256, size=5),
            "old.js": StoredObject(sha256=SHA256, size=1),
        }

    monkeypatch.setattr(deployments, "read_objects", read_objects)
    response = update(client, created, "index.html", "app.js", "about.html", "new.js")

    assert response.status_code == 200
    body = response.json()
    assert [upload["path"] for upload in body["uploads"]] == [
        "app.js",
        "about.html",
        "new.js",
    ]
    # Into a folder of its own, while the site keeps serving its current one
    key = body["uploads"][0]["fields"]["key"]
    assert key == f"{folder_of(body)}app.js" and folder_of(body) != folder_of(created)
    assert datetime.fromisoformat(body["expires_at"]) > datetime.now(UTC)
    assert "token" not in body


def test_one_upload_at_a_time(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = published(client, token, monkeypatch, "index.html")

    assert update(client, created, "index.html").status_code == 200
    response = update(client, created, "index.html")
    assert response.status_code == 409
    assert response.json()["detail"] == "Another upload to this site is in progress"

    # Completing or cancelling frees the site again
    assert complete(client, created).status_code == 200
    assert update(client, created, "index.html").status_code == 200
    assert cancel(client, created).status_code == 204
    assert complete(client, created, "index.html", "app.js").status_code == 410
    assert update(client, created, "index.html").status_code == 200


def test_update_requires_a_published_site(client: TestClient, token: str) -> None:
    created = create(client, token, "index.html")
    response = update(client, created, "index.html")
    assert response.status_code == 409
    assert response.json()["detail"] == "Site isn't published yet"


def test_update_requires_its_owner(
    client: TestClient, token: str, new_token: Callable[[], str]
) -> None:
    created = create(client, token, "index.html")
    other = {**created, "token": new_token()}

    assert update(client, other, "index.html").status_code == 403
    assert cancel(client, other).status_code == 403


def by_folder(
    folders: dict[str, dict[str, int]],
) -> Callable[[str], Awaitable[dict[str, StoredObject]]]:
    """Stored files per folder, by path and size."""

    async def read_objects(folder: str) -> dict[str, StoredObject]:
        files = folders.get(folder, {})
        return {
            path: StoredObject(sha256=SHA256, size=size) for path, size in files.items()
        }

    return read_objects


def usage(client: TestClient, token: str) -> int:
    return client.get(f"{URL}/usage", headers=bearer(token)).json()["used"]


def test_completing_an_update_switches_folders(
    client: TestClient,
    token: str,
    monkeypatch: pytest.MonkeyPatch,
    storage: list[tuple[str, ...]],
    run_cleanup: Callable[[], tuple[int, int, int]],
) -> None:
    created = published(client, token, monkeypatch, "index.html", "old.html")
    served = folder_of(created)
    assert resolve(client, created["slug"]).headers["X-Site-Root"] == (
        "/" + served.removesuffix("/")
    )
    updated = update(client, created, "index.html", "404.html").json()
    folder = folder_of(updated)
    # Only the new file is uploaded, and it counts until the update finishes
    assert [upload["path"] for upload in updated["uploads"]] == ["404.html"]
    assert usage(client, token) == 3

    files = {"index.html": 1, "old.html": 1}
    monkeypatch.setattr(
        deployments, "read_objects", by_folder({served: files, folder: {"404.html": 1}})
    )
    response = complete(client, created, "index.html", "404.html")

    assert response.status_code == 200
    body = response.json()
    assert body["file_count"] == 2
    assert body["spa"] is False
    assert ("copy", served, folder, "index.html") in storage
    site = resolve(client, created["slug"])
    assert site.headers["X-Site-Root"] == "/" + folder.removesuffix("/")
    assert site.headers["X-Site-Spa"] == "0"
    # The old version stays while Nginx may still serve it; only old.html isn't shared
    assert ("delete folder", served) not in storage
    assert usage(client, token) == 3

    monkeypatch.setattr(cleanup, "retire_after", timedelta(0))
    run_cleanup()
    assert ("delete folder", served) in storage
    assert usage(client, token) == 2


def test_cancelling_an_update_deletes_its_files(
    client: TestClient,
    token: str,
    monkeypatch: pytest.MonkeyPatch,
    storage: list[tuple[str, ...]],
) -> None:
    created = published(client, token, monkeypatch, "index.html")
    served = folder_of(created)
    monkeypatch.setattr(
        deployments, "read_objects", by_folder({served: {"index.html": 1}})
    )
    updated = update(client, created, "index.html", "big.bin").json()
    assert usage(client, token) == 2

    assert cancel(client, created).status_code == 204
    assert ("delete folder", folder_of(updated)) in storage
    assert ("delete folder", served) not in storage
    assert usage(client, token) == 1
    assert resolve(client, created["slug"]).headers["X-Site-Root"] == (
        "/" + served.removesuffix("/")
    )


def test_abandoned_updates_are_deleted(
    client: TestClient,
    token: str,
    monkeypatch: pytest.MonkeyPatch,
    storage: list[tuple[str, ...]],
    run_cleanup: Callable[[], tuple[int, int, int]],
) -> None:
    created = published(client, token, monkeypatch, "index.html")
    served = folder_of(created)
    monkeypatch.setattr(
        deployments, "read_objects", by_folder({served: {"index.html": 1}})
    )
    # Neither finished nor cancelled, so its window closes on its own
    monkeypatch.setattr(settings, "upload_window", timedelta(seconds=-1))
    first = folder_of(update(client, created, "index.html", "a.bin").json())

    # The next update deletes it
    second = folder_of(update(client, created, "index.html", "b.bin").json())
    assert ("delete folder", first) in storage

    # And otherwise cleanup does
    run_cleanup()
    assert ("delete folder", second) in storage
    assert ("delete folder", served) not in storage
    assert usage(client, token) == 1


def test_list_ready_deployments_for_its_owner(
    client: TestClient,
    token: str,
    new_token: Callable[[], str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(deployments, "read_objects", stored("index.html"))
    first = create(client, token, "index.html")
    second = create(client, token, "index.html")
    unfinished = create(client, token, "index.html")
    other = create(client, new_token(), "index.html")
    for created in (first, second, other):
        complete(client, created)

    response = client.get(URL, headers=bearer(token))
    assert response.status_code == 200
    assert [site["slug"] for site in response.json()] == [
        second["slug"],
        first["slug"],
    ]
    assert unfinished["slug"] not in response.text


def test_list_deployments_requires_a_user(client: TestClient) -> None:
    assert client.get(URL).status_code == 401
    assert client.get(URL, headers=bearer("x")).status_code == 401


def test_delete_deployment(
    client: TestClient,
    token: str,
    monkeypatch: pytest.MonkeyPatch,
    storage: list[tuple[str, ...]],
) -> None:
    created = published(client, token, monkeypatch, "index.html")
    url = f"{URL}/{created['slug']}"

    response = client.delete(url, headers=bearer(token))
    assert response.status_code == 204
    assert storage == [("delete site", created["slug"])]
    assert client.get(url, headers=bearer(token)).status_code == 404
    assert resolve(client, created["slug"]).status_code == 403


def test_delete_requires_its_owner(
    client: TestClient, token: str, new_token: Callable[[], str]
) -> None:
    created = create(client, token, "index.html")
    url = f"{URL}/{created['slug']}"

    assert client.delete(url).status_code == 401
    assert client.delete(url, headers=bearer(new_token())).status_code == 403
    assert (
        client.delete(f"{URL}/missing-slug", headers=bearer(token)).status_code == 404
    )


def turn(client: TestClient, created: dict[str, str], enabled: bool) -> Response:
    return client.patch(
        f"{URL}/{created['slug']}",
        headers=bearer(created["token"]),
        json={"enabled": enabled},
    )


def test_turn_sites_off_and_on(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = published(client, token, monkeypatch, "index.html")

    response = turn(client, created, False)
    assert response.status_code == 200
    assert response.json()["enabled"] is False
    assert resolve(client, created["slug"]).status_code == 403
    listed = client.get(URL, headers=bearer(token)).json()
    assert [site["enabled"] for site in listed] == [False]

    assert turn(client, created, True).json()["enabled"] is True
    assert resolve(client, created["slug"]).status_code == 204


def test_turning_sites_off_requires_their_owner(
    client: TestClient, token: str, new_token: Callable[[], str]
) -> None:
    created = create(client, token, "index.html")

    assert turn(client, {**created, "token": new_token()}, False).status_code == 403
    assert (
        client.patch(f"{URL}/{created['slug']}", json={"enabled": False}).status_code
        == 401
    )


def test_updates_keep_sites_off(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = published(client, token, monkeypatch, "index.html")
    turn(client, created, False)

    update(client, created, "index.html", "app.js")
    monkeypatch.setattr(deployments, "read_objects", stored("index.html", "app.js"))
    response = complete(client, created, "index.html", "app.js")

    assert response.json()["enabled"] is False
    assert resolve(client, created["slug"]).status_code == 403


def describe(client: TestClient, created: dict[str, str], description: str) -> Response:
    return client.patch(
        f"{URL}/{created['slug']}",
        headers=bearer(created["token"]),
        json={"description": description},
    )


def test_describe_sites(client: TestClient, token: str) -> None:
    body = {**manifest("index.html"), "description": "  Portfolio draft  "}
    created = client.post(URL, json=body, headers=bearer(token)).json()
    assert created["description"] == "Portfolio draft"
    assert create(client, token, "index.html")["description"] == ""

    created["token"] = token
    response = describe(client, created, "Portfolio, final")
    assert response.json()["description"] == "Portfolio, final"
    assert response.json()["enabled"] is True
    assert describe(client, created, "").json()["description"] == ""


def test_descriptions_have_a_limit(client: TestClient, token: str) -> None:
    body = {**manifest("index.html"), "description": "x" * 201}
    assert client.post(URL, json=body, headers=bearer(token)).status_code == 422
    created = create(client, token, "index.html")
    assert describe(client, created, "x" * 201).status_code == 422
    assert describe(client, created, "x" * 200).status_code == 200


def test_updates_describe_sites_once_complete(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = published(client, token, monkeypatch, "index.html")
    describe(client, created, "First draft")
    url = f"{URL}/{created['slug']}"
    body = {**manifest("index.html"), "description": "Second draft"}

    client.put(url, json=body, headers=bearer(token))
    assert client.get(url, headers=bearer(token)).json()["description"] == (
        "First draft"
    )
    response = client.post(f"{url}/complete", json=body, headers=bearer(token))
    assert response.json()["description"] == "Second draft"

    # Updates without one keep the description
    update(client, created, "index.html")
    assert complete(client, created).json()["description"] == "Second draft"


def resolve(client: TestClient, slug: str) -> Response:
    return client.get(f"/internal/sites/{slug}")


@pytest.mark.parametrize(
    ("paths", "spa"),
    [(("index.html", "app.js"), "1"), (("index.html", "404.html"), "0")],
    ids=["no-404-page", "has-404-page"],
)
def test_resolve_site_once_ready(
    client: TestClient,
    token: str,
    monkeypatch: pytest.MonkeyPatch,
    paths: tuple[str, ...],
    spa: str,
) -> None:
    created = create(client, token, *paths)
    assert created["spa"] == (spa == "1")
    assert resolve(client, created["slug"]).status_code == 403

    monkeypatch.setattr(deployments, "read_objects", stored(*paths))
    complete(client, created, *paths)
    response = resolve(client, created["slug"])
    assert response.status_code == 204
    assert response.headers["X-Site-Spa"] == spa


def test_resolve_unknown_site(client: TestClient) -> None:
    assert resolve(client, "missing-slug-0000").status_code == 403


def test_cleanup_removes_expired_uploads_and_orphans(
    client: TestClient,
    token: str,
    monkeypatch: pytest.MonkeyPatch,
    run_cleanup: Callable[[], tuple[int, int, int]],
    storage: list[tuple[str, ...]],
) -> None:
    ready = published(client, token, monkeypatch, "index.html")
    pending = create(client, token, "index.html")
    monkeypatch.setattr(settings, "upload_window", timedelta(seconds=-1))
    expired = create(client, token, "index.html")

    async def list_slugs() -> list[str]:
        return [ready["slug"], pending["slug"], "orphan-slug-0000"]

    monkeypatch.setattr(cleanup, "list_slugs", list_slugs)
    _, orphaned, _ = run_cleanup()
    deleted = [call[1] for call in storage if call[0] == "delete site"]

    assert orphaned == 1
    assert "orphan-slug-0000" in deleted
    assert expired["slug"] in deleted
    assert ready["slug"] not in deleted and pending["slug"] not in deleted
    for created, code in ((expired, 404), (ready, 200), (pending, 200)):
        url = f"{URL}/{created['slug']}"
        assert client.get(url, headers=bearer(token)).status_code == code


def test_users_have_a_storage_limit(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "max_account_size", ByteSize(3))
    published(client, token, monkeypatch, "index.html")
    # Abandoned uploads don't count, even before cleanup removes them
    monkeypatch.setattr(settings, "upload_window", timedelta(seconds=-1))
    create(client, token, "index.html", "app.js")
    monkeypatch.setattr(settings, "upload_window", timedelta(hours=1))
    # Uploads in progress count
    create(client, token, "index.html")

    response = client.post(
        URL, json=manifest("index.html", "app.js"), headers=bearer(token)
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Your sites can use up to 3B in total"
    assert create(client, token, "index.html")["slug"]


def test_read_usage(
    client: TestClient,
    token: str,
    new_token: Callable[[], str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    published(client, token, monkeypatch, "index.html")
    create(client, token, "index.html", "app.js")
    create(client, new_token(), "index.html")
    # Abandoned uploads don't count
    monkeypatch.setattr(settings, "upload_window", timedelta(seconds=-1))
    create(client, token, "index.html")

    response = client.get(f"{URL}/usage", headers=bearer(token))
    assert response.json() == {"used": 3, "limit": settings.max_account_size}
    assert client.get(f"{URL}/usage").status_code == 401


def test_updates_count_at_their_new_size(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "max_account_size", ByteSize(3))
    site = published(client, token, monkeypatch, "index.html")
    published(client, token, monkeypatch, "index.html")

    assert update(client, site, "index.html", "app.js").status_code == 200
    cancel(client, site)
    response = update(client, site, "index.html", "app.js", "404.html")
    assert response.status_code == 403
