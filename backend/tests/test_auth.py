import asyncio
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx2 import Response
from pydantic import ByteSize, SecretStr
from sqlmodel.ext.asyncio.session import AsyncSession

from scripts import cleanup
from src import auth, database, deployments, oidc
from src.config import settings
from src.models import CliLogin, OidcMetadata, UserInfo

SHA256 = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
MANIFEST = {"files": [{"path": "index.html", "size": 0, "sha256": SHA256}]}


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_config_with_dev_sign_in(client: TestClient) -> None:
    assert client.get("/api/auth/config").json() == {"oidc": None, "dev": True}


def test_dev_sign_in(client: TestClient) -> None:
    response = client.post("/api/auth/dev")

    assert response.status_code == 200
    body = response.json()
    assert body["user"] == {
        "id": body["user"]["id"],
        "provider": "google",
        "email": "dev@localhost",
        "name": "Dev User",
    }
    claims = jwt.decode(body["token"], options={"verify_signature": False})
    expires_in = datetime.fromtimestamp(claims["exp"], UTC) - datetime.now(UTC)
    assert timedelta(days=29) < expires_in <= timedelta(days=30)
    # Signing in again finds the same dev user
    again = client.post("/api/auth/dev").json()
    assert again["user"]["id"] == body["user"]["id"]
    me = client.get("/api/auth/me", headers=bearer(again["token"]))
    assert me.json() == body["user"]


def test_rejects_invalid_tokens(client: TestClient, token: str) -> None:
    claims = jwt.decode(token, options={"verify_signature": False})
    secret = settings.jwt_secret.get_secret_value()
    past = datetime.now(UTC) - timedelta(seconds=1)
    invalid = [
        "not-a-token",
        jwt.encode(claims, "another-secret-that-is-long-enough", algorithm="HS256"),
        jwt.encode(claims, None, algorithm="none"),
        jwt.encode({**claims, "exp": past}, secret, algorithm="HS256"),
        jwt.encode({**claims, "sub": "missing"}, secret, algorithm="HS256"),
        jwt.encode({"sub": claims["sub"]}, secret, algorithm="HS256"),
        jwt.encode(
            {"sub": claims["sub"], "iat": claims["iat"]}, secret, algorithm="HS256"
        ),
    ]

    for value in invalid:
        response = client.get("/api/auth/me", headers=bearer(value))
        assert response.status_code == 401
        assert response.headers["WWW-Authenticate"] == "Bearer"


def test_sign_in_is_unavailable_without_oidc(client: TestClient) -> None:
    body = {"code": "code", "code_verifier": "verifier", "redirect_uri": "uri"}

    assert client.post("/api/auth/token", json=body).status_code == 404


def test_deleting_an_account_removes_its_sites(
    client: TestClient,
    token: str,
    new_token: Callable[[], str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def read_checksums(slug: str) -> dict[str, str | None]:
        return {"index.html": SHA256}

    deleted: list[str] = []

    async def delete_objects(slug: str) -> None:
        deleted.append(slug)

    monkeypatch.setattr(deployments, "read_checksums", read_checksums)
    monkeypatch.setattr(auth, "delete_objects", delete_objects)
    published = client.post("/api/deployments", json=MANIFEST, headers=bearer(token))
    client.post(
        f"/api/deployments/{published.json()['slug']}/complete",
        json=MANIFEST,
        headers=bearer(token),
    )
    uploading = client.post("/api/deployments", json=MANIFEST, headers=bearer(token))
    other = new_token()
    kept = client.post("/api/deployments", json=MANIFEST, headers=bearer(other))

    response = client.delete("/api/auth/me", headers=bearer(token))

    assert response.status_code == 204
    assert sorted(deleted) == sorted(
        [published.json()["slug"], uploading.json()["slug"]]
    )
    # Its tokens stop working, and other users keep their sites
    assert client.get("/api/auth/me", headers=bearer(token)).status_code == 401
    kept_url = f"/api/deployments/{kept.json()['slug']}"
    assert client.get(kept_url, headers=bearer(other)).status_code == 200


def test_failed_deletes_keep_the_account(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def delete_objects(slug: str) -> None:
        raise RuntimeError("S3 is unavailable")

    monkeypatch.setattr(auth, "delete_objects", delete_objects)
    client.post("/api/deployments", json=MANIFEST, headers=bearer(token))

    with pytest.raises(RuntimeError):
        client.delete("/api/auth/me", headers=bearer(token))
    assert client.get("/api/auth/me", headers=bearer(token)).status_code == 200


def test_deleting_an_account_requires_a_user(client: TestClient) -> None:
    assert client.delete("/api/auth/me").status_code == 401


def start_cli_login(client: TestClient) -> dict[str, str]:
    return client.post("/api/auth/cli").json()


def approve(client: TestClient, login: dict[str, str], token: str) -> Response:
    return client.post(f"/api/auth/cli/{login['id']}", headers=bearer(token))


def claim(client: TestClient, login: dict[str, str], secret: str = "") -> Response:
    return client.post(
        f"/api/auth/cli/{login['id']}/token",
        json={"secret": secret or login["secret"]},
    )


def test_cli_sign_in(client: TestClient, token: str) -> None:
    login = start_cli_login(client)
    # Pending until it's approved in the browser
    assert claim(client, login).status_code == 202

    assert approve(client, login, token).status_code == 204
    response = claim(client, login)

    assert response.status_code == 200
    me = client.get("/api/auth/me", headers=bearer(response.json()["token"]))
    assert (
        me.json()["id"] == jwt.decode(token, options={"verify_signature": False})["sub"]
    )
    # Each link signs in once
    assert claim(client, login).status_code == 404


def test_cli_sign_in_needs_the_cli_secret(client: TestClient, token: str) -> None:
    login = start_cli_login(client)
    approve(client, login, token)

    assert claim(client, login, secret="wrong").status_code == 404
    assert claim(client, login).status_code == 200


def test_cli_sign_in_links_are_approved_once(
    client: TestClient, token: str, new_token: Callable[[], str]
) -> None:
    login = start_cli_login(client)

    assert client.post(f"/api/auth/cli/{login['id']}").status_code == 401
    assert approve(client, login, token).status_code == 204
    assert approve(client, login, new_token()).status_code == 404
    claimed = claim(client, login).json()["user"]["id"]
    assert claimed == jwt.decode(token, options={"verify_signature": False})["sub"]


def test_cli_sign_in_links_expire(
    client: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(auth, "cli_login_lifetime", timedelta(seconds=-1))
    login = start_cli_login(client)

    assert approve(client, login, token).status_code == 404
    assert claim(client, login).status_code == 404


def test_cleanup_removes_expired_cli_sign_ins(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    run_cleanup: Callable[[], tuple[int, int]],
) -> None:
    async def list_slugs() -> list[str]:
        return []

    async def read_login(login_id: str) -> CliLogin | None:
        async with AsyncSession(database.engine) as session:
            return await session.get(CliLogin, login_id)

    monkeypatch.setattr(cleanup, "list_slugs", list_slugs)
    kept = start_cli_login(client)
    monkeypatch.setattr(auth, "cli_login_lifetime", timedelta(seconds=-1))
    expired = start_cli_login(client)

    run_cleanup()
    assert asyncio.run(read_login(expired["id"])) is None
    assert asyncio.run(read_login(kept["id"])) is not None


def test_deleting_an_account_removes_its_cli_sign_ins(
    client: TestClient, token: str
) -> None:
    login = start_cli_login(client)
    approve(client, login, token)

    assert client.delete("/api/auth/me", headers=bearer(token)).status_code == 204
    assert claim(client, login).status_code == 404


METADATA = OidcMetadata(
    authorization_endpoint="https://id.example.com/authorize",
    token_endpoint="https://id.example.com/token",
    userinfo_endpoint="https://id.example.com/userinfo",
)


@pytest.fixture
def accounts(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    monkeypatch.setattr(settings, "oidc_issuer", "https://id.example.com/")
    monkeypatch.setattr(settings, "oidc_client_id", "redoost")
    monkeypatch.setattr(settings, "oidc_client_secret", SecretStr("client-secret"))

    async def read_metadata() -> OidcMetadata:
        return METADATA

    monkeypatch.setattr(oidc, "read_metadata", read_metadata)
    # The app picks its routers at import, with dev sign-in for the tests
    app = FastAPI()
    for router in (auth.router, auth.oidc_router, deployments.router):
        app.include_router(router)
    with TestClient(app) as test_client:
        yield test_client


def sign_in(
    accounts: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    subject: str = "subject-1",
    email: str = "ada@example.com",
) -> Response:
    async def read_userinfo(
        code: str, code_verifier: str, redirect_uri: str
    ) -> UserInfo:
        assert (code, code_verifier) == ("code", "verifier")
        assert redirect_uri == "https://redoost.example.com/auth/callback"
        return UserInfo(sub=subject, email=email, name="Ada Lovelace")

    monkeypatch.setattr(oidc, "read_userinfo", read_userinfo)
    return accounts.post(
        "/api/auth/token",
        json={
            "code": "code",
            "code_verifier": "verifier",
            "redirect_uri": "https://redoost.example.com/auth/callback",
        },
    )


def test_config_with_sign_in(accounts: TestClient) -> None:
    assert accounts.get("/api/auth/config").json() == {
        "oidc": {
            "provider": "google",
            "authorization_endpoint": METADATA.authorization_endpoint,
            "client_id": "redoost",
            "scope": "openid email profile",
        },
        "dev": False,
    }


def test_config_reports_an_unreachable_provider(
    accounts: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def read_metadata() -> OidcMetadata:
        raise oidc.OidcError("Couldn't read the provider's configuration")

    monkeypatch.setattr(oidc, "read_metadata", read_metadata)

    assert accounts.get("/api/auth/config").status_code == 502


def test_sign_in(accounts: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    response = sign_in(accounts, monkeypatch)

    assert response.status_code == 200
    body = response.json()
    assert body["user"] == {
        "id": body["user"]["id"],
        "provider": "google",
        "email": "ada@example.com",
        "name": "Ada Lovelace",
    }
    claims = jwt.decode(body["token"], options={"verify_signature": False})
    expires_in = datetime.fromtimestamp(claims["exp"], UTC) - datetime.now(UTC)
    assert timedelta(days=29) < expires_in <= timedelta(days=30)
    me = accounts.get("/api/auth/me", headers=bearer(body["token"]))
    assert me.json() == body["user"]


def test_signing_in_again_finds_the_same_user(
    accounts: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = sign_in(accounts, monkeypatch).json()["user"]
    again = sign_in(accounts, monkeypatch, email="ada@example.org").json()["user"]
    other = sign_in(accounts, monkeypatch, subject="subject-2").json()["user"]

    assert again["id"] == first["id"]
    # Profile details follow the provider
    assert again["email"] == "ada@example.org"
    assert other["id"] != first["id"]


def test_failed_sign_in(accounts: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def read_userinfo(
        code: str, code_verifier: str, redirect_uri: str
    ) -> UserInfo:
        raise oidc.OidcError("Couldn't sign in with the provider")

    monkeypatch.setattr(oidc, "read_userinfo", read_userinfo)
    body = {"code": "code", "code_verifier": "verifier", "redirect_uri": "uri"}

    response = accounts.post("/api/auth/token", json=body)
    assert response.status_code == 400
    assert response.json()["detail"] == "Couldn't sign in with the provider"


def test_dev_sign_in_is_unavailable_with_oidc(accounts: TestClient) -> None:
    assert accounts.post("/api/auth/dev").status_code == 404


def test_signing_in_after_deleting_starts_afresh(
    accounts: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = sign_in(accounts, monkeypatch, subject="deleted").json()
    response = accounts.delete("/api/auth/me", headers=bearer(first["token"]))
    again = sign_in(accounts, monkeypatch, subject="deleted").json()

    assert response.status_code == 204
    assert again["user"]["id"] != first["user"]["id"]
    listed = accounts.get("/api/deployments", headers=bearer(again["token"]))
    assert listed.json() == []


def test_account_sites_count_toward_their_storage(
    accounts: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "max_account_size", ByteSize(1))
    account = sign_in(accounts, monkeypatch, subject="quota").json()["token"]
    site = {"files": [{"path": "index.html", "size": 1, "sha256": SHA256}]}

    async def read_checksums(slug: str) -> dict[str, str | None]:
        return {"index.html": SHA256}

    monkeypatch.setattr(deployments, "read_checksums", read_checksums)
    created = accounts.post("/api/deployments", json=site, headers=bearer(account))
    accounts.post(
        f"/api/deployments/{created.json()['slug']}/complete",
        json=site,
        headers=bearer(account),
    )

    # Published sites take up room
    response = accounts.post("/api/deployments", json=site, headers=bearer(account))
    assert response.status_code == 403
