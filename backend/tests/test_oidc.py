import asyncio
import base64
from collections.abc import Awaitable, Callable

import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer
from pydantic import SecretStr

from src import oidc
from src.config import settings
from src.models import UserInfo


async def serve(
    test: Callable[[str, list[str]], Awaitable[None]], token_status: int = 200
) -> None:
    """Runs the test against a minimal OIDC provider over real HTTP."""
    requests: list[str] = []

    async def configuration(request: web.Request) -> web.Response:
        requests.append("configuration")
        base = f"http://{request.host}"
        return web.json_response(
            {
                "authorization_endpoint": f"{base}/authorize",
                "token_endpoint": f"{base}/token",
                "userinfo_endpoint": f"{base}/userinfo",
            }
        )

    async def token(request: web.Request) -> web.Response:
        requests.append("token")
        credentials = base64.b64encode(b"redoost:client-secret").decode()
        assert request.headers["Authorization"] == f"Basic {credentials}"
        form = await request.post()
        assert dict(form) == {
            "grant_type": "authorization_code",
            "code": "code",
            "code_verifier": "verifier",
            "redirect_uri": "https://redoost.example.com/auth/callback",
        }
        return web.json_response({"access_token": "access"}, status=token_status)

    async def userinfo(request: web.Request) -> web.Response:
        requests.append("userinfo")
        assert request.headers["Authorization"] == "Bearer access"
        return web.json_response(
            {"sub": "subject-1", "email": "ada@example.com", "name": "Ada Lovelace"}
        )

    app = web.Application()
    app.router.add_get(
        "/application/o/redoost/.well-known/openid-configuration", configuration
    )
    app.router.add_post("/token", token)
    app.router.add_get("/userinfo", userinfo)
    server = TestServer(app, host="127.0.0.1")
    await server.start_server()
    try:
        await test(str(server.make_url("/application/o/redoost/")), requests)
    finally:
        await server.close()


@pytest.fixture(autouse=True)
def configure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(oidc, "_metadata", None)
    monkeypatch.setattr(settings, "oidc_client_id", "redoost")
    monkeypatch.setattr(settings, "oidc_client_secret", SecretStr("client-secret"))


def test_reads_the_user_behind_a_code(monkeypatch: pytest.MonkeyPatch) -> None:
    async def test(issuer: str, requests: list[str]) -> None:
        monkeypatch.setattr(settings, "oidc_issuer", issuer)
        metadata = await oidc.read_metadata()
        info = await oidc.read_userinfo(
            "code", "verifier", "https://redoost.example.com/auth/callback"
        )

        assert metadata.authorization_endpoint.endswith("/authorize")
        assert info == UserInfo(
            sub="subject-1", email="ada@example.com", name="Ada Lovelace"
        )
        # The provider's configuration is read once
        assert requests == ["configuration", "token", "userinfo"]

    asyncio.run(serve(test))


def test_rejected_codes_fail_the_sign_in(monkeypatch: pytest.MonkeyPatch) -> None:
    async def test(issuer: str, requests: list[str]) -> None:
        monkeypatch.setattr(settings, "oidc_issuer", issuer)
        with pytest.raises(oidc.OidcError):
            await oidc.read_userinfo(
                "code", "verifier", "https://redoost.example.com/auth/callback"
            )
        assert "userinfo" not in requests

    asyncio.run(serve(test, token_status=400))


def test_unreachable_providers_fail(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "oidc_issuer", "http://127.0.0.1:9/")

    with pytest.raises(oidc.OidcError):
        asyncio.run(oidc.read_metadata())
