import asyncio
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import col, select

from . import oidc
from .config import settings
from .database import Session
from .models import (
    AuthConfig,
    Deployment,
    OidcConfig,
    SignIn,
    Token,
    User,
    UserBase,
)
from .storage import delete_objects

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Only one of these is served, depending on whether sign-in is configured
anonymous_router = APIRouter(prefix="/api/auth", tags=["auth"])
account_router = APIRouter(prefix="/api/auth", tags=["auth"])

# Anonymous tokens never expire, since they're the only way back to their sites
account_token_lifetime = timedelta(days=30)

Credentials = Annotated[HTTPAuthorizationCredentials, Depends(HTTPBearer())]


def create_token(user: User) -> Token:
    now = datetime.now(UTC)
    claims: dict[str, Any] = {"sub": user.id, "iat": now}
    if user.provider:
        claims["exp"] = now + account_token_lifetime
    token = jwt.encode(
        claims, settings.jwt_secret.get_secret_value(), algorithm="HS256"
    )
    return Token(token=token, user=UserBase.model_validate(user))


def invalid_token() -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "Invalid token",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def current_user(session: Session, credentials: Credentials) -> User:
    try:
        claims = jwt.decode(
            credentials.credentials,
            settings.jwt_secret.get_secret_value(),
            algorithms=["HS256"],
            options={"require": ["sub", "iat"]},
        )
    except jwt.InvalidTokenError:
        raise invalid_token() from None
    user = await session.get(User, claims["sub"])
    # Tokens from the other mode stop working when an install switches
    if user is None or (user.provider is None) != (settings.oidc_issuer is None):
        raise invalid_token()
    return user


CurrentUser = Annotated[User, Depends(current_user)]


@router.get("/config")
async def read_config() -> AuthConfig:
    if not settings.oidc_issuer or not settings.oidc_client_id:
        return AuthConfig(oidc=None)
    try:
        metadata = await oidc.read_metadata()
    except oidc.OidcError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(error)) from error
    return AuthConfig(
        oidc=OidcConfig(
            provider=settings.oidc_provider,
            authorization_endpoint=metadata.authorization_endpoint,
            client_id=settings.oidc_client_id,
            scope=oidc.scope,
        )
    )


@router.get("/me")
async def read_user(user: CurrentUser) -> UserBase:
    return user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user: CurrentUser, session: Session) -> None:
    query = select(Deployment).where(Deployment.owner_id == user.id)
    result = await session.exec(query)
    deployments = result.all()
    # Files go first, so a failed delete leaves the account in place to retry
    deletes = [delete_objects(deployment.slug) for deployment in deployments]
    await asyncio.gather(*deletes)
    for deployment in deployments:
        await session.delete(deployment)
    await session.delete(user)
    await session.commit()


@anonymous_router.post("/anonymous", status_code=status.HTTP_201_CREATED)
async def create_anonymous_user(session: Session) -> Token:
    user = User()
    session.add(user)
    await session.commit()
    return create_token(user)


@account_router.post("/token")
async def sign_in(body: SignIn, session: Session) -> Token:
    try:
        info = await oidc.read_userinfo(
            body.code, body.code_verifier, body.redirect_uri
        )
    except oidc.OidcError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error

    query = select(User).where(
        col(User.provider) == settings.oidc_provider, col(User.subject) == info.sub
    )
    result = await session.exec(query)
    user = result.first() or User(provider=settings.oidc_provider, subject=info.sub)
    # Kept current, since users can change them at the provider
    user.email = info.email
    user.name = info.name
    session.add(user)
    await session.commit()
    return create_token(user)
