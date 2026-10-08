from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import Response
from pydantic import ByteSize, SecretStr

from scripts import cleanup
from src import auth, deployments, oidc
from src.config import settings
from src.models import OidcMetadata, UserInfo

SHA256 = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
MANIFEST = {"files": [{"path": "index.html", "size": 0, "sha256": SHA256}]}


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_config_without_sign_in(client: TestClient) -> None:
    assert client.get("/api/auth/config").json() == {"oidc": None}


def test_anonymous_users(client: TestClient, token: str) -> None:
    response = client.get("/api/auth/me", headers=bearer(token))

    assert response.status_code == 200
    assert response.json() == {
        "id": jwt.decode(token, options={"verify_signature": False})["sub"],
        "provider": None,
        "email": None,
        "name": None,
    }
    # They have no other way back to their sites
    assert "exp" not in jwt.decode(token, options={"verify_signature": False})


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
    ]

    for value in invalid:
        response = client.get("/api/auth/me", headers=bearer(value))
        assert response.status_code == 401
        assert response.headers["WWW-Authenticate"] == "Bearer"


def test_sign_in_is_unavailable_without_oidc(client: TestClient) -> None:
    body = {"code": "code", "code_verifier": "verifier", "redirect_uri": "uri"}

    assert client.post("/api/auth/token", json=body).status_code == 404


def test_cleanup_removes_anonymous_users_without_sites(
    client: TestClient,
    new_token: Callable[[], str],
    monkeypatch: pytest.MonkeyPatch,
    run_cleanup: Callable[[], tuple[int, int, int]],
) -> None:
    async def list_slugs() -> list[str]:
        return []

    monkeypatch.setattr(cleanup, "list_slugs", list_slugs)
    with_site, without_site = new_token(), new_token()
    client.post("/api/deployments", json=MANIFEST, headers=bearer(with_site))

    def signed_in(token: str) -> bool:
        return client.get("/api/auth/me", headers=bearer(token)).status_code == 200

    # New users may be about to publish
    run_cleanup()
    assert signed_in(without_site)
    monkeypatch.setattr(settings, "upload_window", timedelta(seconds=-1))
    run_cleanup()
    assert not signed_in(without_site)
    assert signed_in(with_site)


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
    # The app picks its routers at import, in anonymous mode for the tests
    app = FastAPI()
    for router in (auth.router, auth.account_router, deployments.router):
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
        }
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


def test_accounts_replace_anonymous_users(
    accounts: TestClient, token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert accounts.post("/api/auth/anonymous").status_code == 404
    # Tokens from before sign-in was configured stop working
    assert accounts.get("/api/auth/me", headers=bearer(token)).status_code == 401

    account = sign_in(accounts, monkeypatch).json()["token"]
    monkeypatch.setattr(settings, "oidc_issuer", None)
    assert accounts.get("/api/auth/me", headers=bearer(account)).status_code == 401


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

    # Published account sites never expire, and still take up room
    response = accounts.post("/api/deployments", json=site, headers=bearer(account))
    assert response.status_code == 403


def test_account_sites_have_no_limit_or_lifetime(
    accounts: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "anonymous_site_limit", 1)
    account = sign_in(accounts, monkeypatch).json()["token"]

    async def read_checksums(slug: str) -> dict[str, str | None]:
        return {"index.html": SHA256}

    monkeypatch.setattr(deployments, "read_checksums", read_checksums)
    for _ in range(3):
        created = accounts.post(
            "/api/deployments", json=MANIFEST, headers=bearer(account)
        ).json()
        completed = accounts.post(
            f"/api/deployments/{created['slug']}/complete",
            json=MANIFEST,
            headers=bearer(account),
        )
        assert completed.json()["available_until"] is None

    listed = accounts.get("/api/deployments", headers=bearer(account)).json()
    assert len(listed) == 3
