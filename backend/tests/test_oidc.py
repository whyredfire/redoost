import asyncio
import base64
from urllib.parse import parse_qsl

import httpx2
import pytest
from pydantic import SecretStr

from src import oidc
from src.config import settings
from src.models import UserInfo

ISSUER = "https://id.example.com/application/o/redoost/"


def provider(
    requests: list[str], token_status: int = 200, configuration: bytes | None = None
) -> httpx2.MockTransport:
    """A minimal OIDC provider that checks the requests it gets."""

    def handle(request: httpx2.Request) -> httpx2.Response:
        path = request.url.path
        if path.endswith("/.well-known/openid-configuration"):
            requests.append("configuration")
            if configuration is not None:
                return httpx2.Response(200, content=configuration)
            return httpx2.Response(
                200,
                json={
                    "authorization_endpoint": "https://id.example.com/authorize",
                    "token_endpoint": "https://id.example.com/token",
                    "userinfo_endpoint": "https://id.example.com/userinfo",
                },
            )
        if path == "/token":
            requests.append("token")
            credentials = base64.b64encode(b"redoost:client-secret").decode()
            assert request.headers["Authorization"] == f"Basic {credentials}"
            assert dict(parse_qsl(request.content.decode())) == {
                "grant_type": "authorization_code",
                "code": "code",
                "code_verifier": "verifier",
                "redirect_uri": "https://redoost.example.com/auth/callback",
            }
            return httpx2.Response(token_status, json={"access_token": "access"})
        requests.append("userinfo")
        assert request.headers["Authorization"] == "Bearer access"
        return httpx2.Response(
            200,
            json={
                "sub": "subject-1",
                "email": "ada@example.com",
                "name": "Ada Lovelace",
            },
        )

    return httpx2.MockTransport(handle)


@pytest.fixture(autouse=True)
def configure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(oidc, "_metadata", None)
    monkeypatch.setattr(settings, "oidc_issuer", ISSUER)
    monkeypatch.setattr(settings, "oidc_client_id", "redoost")
    monkeypatch.setattr(settings, "oidc_client_secret", SecretStr("client-secret"))


def use(monkeypatch: pytest.MonkeyPatch, transport: httpx2.MockTransport) -> None:
    monkeypatch.setattr(
        oidc, "client", lambda: httpx2.AsyncClient(transport=transport, timeout=10)
    )


def sign_in() -> UserInfo:
    return asyncio.run(
        oidc.read_userinfo(
            "code", "verifier", "https://redoost.example.com/auth/callback"
        )
    )


def test_reads_the_user_behind_a_code(monkeypatch: pytest.MonkeyPatch) -> None:
    requests: list[str] = []
    use(monkeypatch, provider(requests))

    metadata = asyncio.run(oidc.read_metadata())
    info = sign_in()

    assert metadata.authorization_endpoint == "https://id.example.com/authorize"
    assert info == UserInfo(
        sub="subject-1", email="ada@example.com", name="Ada Lovelace"
    )
    # The provider's configuration is read once
    assert requests == ["configuration", "token", "userinfo"]


def test_rejected_codes_fail_the_sign_in(monkeypatch: pytest.MonkeyPatch) -> None:
    requests: list[str] = []
    use(monkeypatch, provider(requests, token_status=400))

    with pytest.raises(oidc.OidcError):
        sign_in()
    assert "userinfo" not in requests


def test_malformed_configuration_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    use(monkeypatch, provider([], configuration=b"<html>not json</html>"))

    with pytest.raises(oidc.OidcError):
        asyncio.run(oidc.read_metadata())


def test_unreachable_providers_fail(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "oidc_issuer", "http://127.0.0.1:9/")

    with pytest.raises(oidc.OidcError):
        asyncio.run(oidc.read_metadata())
