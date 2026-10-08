import httpx2

from .config import settings
from .models import OidcMetadata, UserInfo

scope = "openid email profile"


class OidcError(Exception):
    pass


_metadata: OidcMetadata | None = None


def client() -> httpx2.AsyncClient:
    return httpx2.AsyncClient(timeout=10)


async def discover(http: httpx2.AsyncClient) -> OidcMetadata:
    global _metadata
    if _metadata is None:
        issuer = str(settings.oidc_issuer).rstrip("/")
        response = await http.get(f"{issuer}/.well-known/openid-configuration")
        response.raise_for_status()
        _metadata = OidcMetadata.model_validate(response.json())
    return _metadata


async def read_metadata() -> OidcMetadata:
    try:
        async with client() as http:
            metadata = await discover(http)
    # ValueError covers malformed JSON and missing fields
    except (httpx2.HTTPError, ValueError) as error:
        raise OidcError("Couldn't read the provider's configuration") from error
    return metadata


# Tokens from the provider over TLS are trusted unsigned (OIDC Core 3.1.3.7)
async def read_userinfo(code: str, code_verifier: str, redirect_uri: str) -> UserInfo:
    assert settings.oidc_client_id and settings.oidc_client_secret
    try:
        async with client() as http:
            metadata = await discover(http)
            response = await http.post(
                metadata.token_endpoint,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "code_verifier": code_verifier,
                    "redirect_uri": redirect_uri,
                },
                auth=(
                    settings.oidc_client_id,
                    settings.oidc_client_secret.get_secret_value(),
                ),
            )
            response.raise_for_status()
            access_token = response.json()["access_token"]
            response = await http.get(
                metadata.userinfo_endpoint,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            response.raise_for_status()
        info = UserInfo.model_validate(response.json())
    except (httpx2.HTTPError, ValueError, KeyError) as error:
        raise OidcError("Couldn't sign in with the provider") from error
    return info
