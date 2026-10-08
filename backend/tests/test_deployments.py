import base64
import hashlib
import json
import re
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from pydantic import ByteSize

from scripts import cleanup
from src import deployments
from src.config import settings
from src.storage import content_type

URL = "/api/deployments"
SHA256 = base64.b64encode(hashlib.sha256(b"").digest()).decode()
OTHER_SHA256 = base64.b64encode(hashlib.sha256(b"other").digest()).decode()


def manifest(*paths: str, size: int = 1) -> dict[str, list[dict[str, str | int]]]:
    return {"files": [{"path": path, "size": size, "sha256": SHA256} for path in paths]}


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
    *paths: str, sha256: str = SHA256
) -> Callable[[str], Awaitable[dict[str, str | None]]]:
    async def read_checksums(slug: str) -> dict[str, str | None]:
        return dict.fromkeys(paths, sha256)

    return read_checksums


def test_complete_marks_deployment_ready(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = create(client, token, "index.html", "app.js")
    monkeypatch.setattr(deployments, "read_checksums", stored("index.html", "app.js"))

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
    checksums: Callable[[str], Awaitable[dict[str, str | None]]],
) -> None:
    created = create(client, token, "index.html", "app.js")
    monkeypatch.setattr(deployments, "read_checksums", checksums)

    response = complete(client, created, "index.html", "app.js")
    assert response.status_code == 409
    assert response.json()["detail"].endswith("of 2 files uploaded")


def test_complete_rejects_closed_upload_window(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "upload_window", timedelta(seconds=-1))
    created = create(client, token, "index.html")
    monkeypatch.setattr(deployments, "read_checksums", stored("index.html"))

    assert complete(client, created).status_code == 410


def test_complete_requires_its_owner(
    client: TestClient, token: str, new_token: Callable[[], str]
) -> None:
    created = create(client, token, "index.html")

    assert complete(client, {**created, "token": new_token()}).status_code == 403


def published(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch, *paths: str
) -> dict[str, str]:
    monkeypatch.setattr(deployments, "read_checksums", stored(*paths))
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

    async def read_checksums(slug: str) -> dict[str, str | None]:
        return {"index.html": SHA256, "app.js": OTHER_SHA256, "old.js": SHA256}

    monkeypatch.setattr(deployments, "read_checksums", read_checksums)
    response = update(client, created, "index.html", "app.js", "new.js")

    assert response.status_code == 200
    body = response.json()
    assert [upload["path"] for upload in body["uploads"]] == ["app.js", "new.js"]
    assert body["uploads"][0]["fields"]["key"] == f"{created['slug']}/app.js"
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


def test_update_requires_a_published_site(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = create(client, token, "index.html")
    response = update(client, created, "index.html")
    assert response.status_code == 409
    assert response.json()["detail"] == "Site isn't published yet"

    monkeypatch.setattr(settings, "anonymous_site_lifetime", timedelta(seconds=-1))
    expired = published(client, token, monkeypatch, "index.html")
    assert update(client, expired, "index.html").status_code == 410


def test_update_requires_its_owner(
    client: TestClient, token: str, new_token: Callable[[], str]
) -> None:
    created = create(client, token, "index.html")
    other = {**created, "token": new_token()}

    assert update(client, other, "index.html").status_code == 403
    assert cancel(client, other).status_code == 403


def test_completing_an_update_replaces_the_site(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = published(client, token, monkeypatch, "index.html", "old.html")
    until = client.get(f"{URL}/{created['slug']}", headers=bearer(token)).json()[
        "available_until"
    ]
    update(client, created, "index.html", "404.html")

    deleted: list[tuple[str, list[str] | None]] = []

    async def delete_objects(slug: str, paths: list[str] | None = None) -> None:
        deleted.append((slug, paths))

    stored_files = stored("index.html", "old.html", "404.html")
    monkeypatch.setattr(deployments, "read_checksums", stored_files)
    monkeypatch.setattr(deployments, "delete_objects", delete_objects)
    response = complete(client, created, "index.html", "404.html")

    assert response.status_code == 200
    body = response.json()
    assert deleted == [(created["slug"], ["old.html"])]
    assert body["file_count"] == 2
    assert body["spa"] is False
    # Updates don't give anonymous sites more time
    assert body["available_until"] == until
    assert resolve(client, created["slug"]).headers["X-Site-Spa"] == "0"


def test_list_ready_deployments_for_its_owner(
    client: TestClient,
    token: str,
    new_token: Callable[[], str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(deployments, "read_checksums", stored("index.html"))
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
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    deleted: list[str] = []

    async def delete_objects(slug: str) -> None:
        deleted.append(slug)

    created = published(client, token, monkeypatch, "index.html")
    monkeypatch.setattr(deployments, "delete_objects", delete_objects)
    url = f"{URL}/{created['slug']}"

    response = client.delete(url, headers=bearer(token))
    assert response.status_code == 204
    assert deleted == [created["slug"]]
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

    monkeypatch.setattr(deployments, "read_checksums", stored(*paths))
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
) -> None:
    deleted: list[str] = []

    async def delete_objects(slug: str) -> None:
        deleted.append(slug)

    monkeypatch.setattr(cleanup, "delete_objects", delete_objects)
    ready = published(client, token, monkeypatch, "index.html")
    pending = create(client, token, "index.html")
    monkeypatch.setattr(settings, "upload_window", timedelta(seconds=-1))
    expired = create(client, token, "index.html")

    async def list_slugs() -> list[str]:
        return [ready["slug"], pending["slug"], "orphan-slug-0000"]

    monkeypatch.setattr(cleanup, "list_slugs", list_slugs)
    _, orphaned, _ = run_cleanup()

    assert orphaned == 1
    assert "orphan-slug-0000" in deleted
    assert expired["slug"] in deleted
    assert ready["slug"] not in deleted and pending["slug"] not in deleted
    for created, code in ((expired, 404), (ready, 200), (pending, 200)):
        url = f"{URL}/{created['slug']}"
        assert client.get(url, headers=bearer(token)).status_code == code


def test_anonymous_sites_expire_after_their_lifetime(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(deployments, "read_checksums", stored("index.html"))
    created = create(client, token, "index.html")
    # Uploads haven't started their lifetime yet
    assert created["available_until"] is None

    until = datetime.fromisoformat(complete(client, created).json()["available_until"])
    lifetime = settings.anonymous_site_lifetime
    assert lifetime - timedelta(minutes=1) < until - datetime.now(UTC) <= lifetime

    # Later changes to the setting don't move the date
    monkeypatch.setattr(settings, "anonymous_site_lifetime", timedelta(days=1))
    response = client.get(f"{URL}/{created['slug']}", headers=bearer(token))
    assert datetime.fromisoformat(response.json()["available_until"]) == until


def test_anonymous_users_have_a_site_limit(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "anonymous_site_limit", 2)
    monkeypatch.setattr(deployments, "read_checksums", stored("index.html"))
    first = published(client, token, monkeypatch, "index.html")
    create(client, token, "index.html")

    response = client.post(URL, json=manifest("index.html"), headers=bearer(token))
    assert response.status_code == 403
    assert response.json()["detail"] == (
        "Anonymous users can have up to 2 sites at once"
    )

    # Deleting a site frees its slot
    async def delete_objects(slug: str) -> None:
        pass

    monkeypatch.setattr(deployments, "delete_objects", delete_objects)
    client.delete(f"{URL}/{first['slug']}", headers=bearer(token))
    assert create(client, token, "index.html")["slug"]


def test_expired_sites_and_uploads_free_their_slots(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "anonymous_site_limit", 2)
    monkeypatch.setattr(settings, "anonymous_site_lifetime", timedelta(seconds=-1))
    published(client, token, monkeypatch, "index.html")
    monkeypatch.setattr(settings, "upload_window", timedelta(seconds=-1))
    create(client, token, "index.html")

    # Neither counts, even before cleanup removes them
    monkeypatch.setattr(settings, "upload_window", timedelta(hours=1))
    assert create(client, token, "index.html")["slug"]
    assert create(client, token, "index.html")["slug"]
    response = client.post(URL, json=manifest("index.html"), headers=bearer(token))
    assert response.status_code == 403


def test_users_have_a_storage_limit(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "max_account_size", ByteSize(3))
    published(client, token, monkeypatch, "index.html")
    # Uploads in progress count too
    create(client, token, "index.html")

    response = client.post(
        URL, json=manifest("index.html", "app.js"), headers=bearer(token)
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Your sites can use up to 3B in total"
    assert create(client, token, "index.html")["slug"]


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


def test_expired_sites_are_hidden_and_cleaned_up(
    client: TestClient,
    token: str,
    monkeypatch: pytest.MonkeyPatch,
    run_cleanup: Callable[[], tuple[int, int, int]],
) -> None:
    monkeypatch.setattr(settings, "anonymous_site_lifetime", timedelta(seconds=-1))
    expired = published(client, token, monkeypatch, "index.html")
    monkeypatch.setattr(settings, "anonymous_site_lifetime", timedelta(days=7))
    kept = published(client, token, monkeypatch, "index.html")

    assert resolve(client, expired["slug"]).status_code == 403
    assert resolve(client, kept["slug"]).status_code == 204
    listed = client.get(URL, headers=bearer(token)).json()
    assert [site["slug"] for site in listed] == [kept["slug"]]

    deleted: list[str] = []

    async def delete_objects(slug: str) -> None:
        deleted.append(slug)

    async def list_slugs() -> list[str]:
        return [expired["slug"], kept["slug"]]

    monkeypatch.setattr(cleanup, "delete_objects", delete_objects)
    monkeypatch.setattr(cleanup, "list_slugs", list_slugs)
    run_cleanup()
    assert expired["slug"] in deleted and kept["slug"] not in deleted
