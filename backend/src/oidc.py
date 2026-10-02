import aiohttp
from pydantic import ValidationError

from .config import settings
from .models import OidcMetadata, UserInfo

scope = "openid email profile"


class OidcError(Exception):
    pass


_metadata: OidcMetadata | None = None


def client() -> aiohttp.ClientSession:
    return aiohttp.ClientSession(
        raise_for_status=True, timeout=aiohttp.ClientTimeout(total=10)
    )


async def discover(http: aiohttp.ClientSession) -> OidcMetadata:
    global _metadata
    if _metadata is None:
        issuer = str(settings.oidc_issuer).rstrip("/")
        async with http.get(f"{issuer}/.well-known/openid-configuration") as response:
            body = await response.json()
        _metadata = OidcMetadata.model_validate(body)
    return _metadata


async def read_metadata() -> OidcMetadata:
    try:
        async with client() as http:
            metadata = await discover(http)
    except (aiohttp.ClientError, TimeoutError, ValidationError) as error:
        raise OidcError("Couldn't read the provider's configuration") from error
    return metadata


# Tokens from the provider over TLS are trusted unsigned (OIDC Core 3.1.3.7)
async def read_userinfo(code: str, code_verifier: str, redirect_uri: str) -> UserInfo:
    assert settings.oidc_client_id and settings.oidc_client_secret
    try:
        async with client() as http:
            metadata = await discover(http)
            async with http.post(
                metadata.token_endpoint,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "code_verifier": code_verifier,
                    "redirect_uri": redirect_uri,
                },
                headers={
                    "Authorization": aiohttp.encode_basic_auth(
                        settings.oidc_client_id,
                        settings.oidc_client_secret.get_secret_value(),
                    )
                },
            ) as response:
                tokens = await response.json()
            async with http.get(
                metadata.userinfo_endpoint,
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            ) as response:
                body = await response.json()
        info = UserInfo.model_validate(body)
    except (aiohttp.ClientError, TimeoutError, KeyError, ValidationError) as error:
        raise OidcError("Couldn't sign in with the provider") from error
    return info
