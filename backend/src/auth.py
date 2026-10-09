import asyncio
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

import jwt
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select

from . import oidc
from .config import Provider, settings
from .database import Session
from .models import (
    AuthConfig,
    CliLogin,
    CliLoginClaim,
    CliLoginStarted,
    Deployment,
    OidcConfig,
    SignIn,
    Token,
    User,
    UserBase,
)
from .storage import delete_objects

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Only one of these is served, depending on how users sign in
oidc_router = APIRouter(prefix="/api/auth", tags=["auth"])
dev_router = APIRouter(prefix="/api/auth", tags=["auth"])

token_lifetime = timedelta(days=30)
cli_login_lifetime = timedelta(minutes=10)

Credentials = Annotated[HTTPAuthorizationCredentials, Depends(HTTPBearer())]


def create_token(user: User) -> Token:
    now = datetime.now(UTC)
    claims: dict[str, Any] = {"sub": user.id, "iat": now, "exp": now + token_lifetime}
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
            options={"require": ["sub", "iat", "exp"]},
        )
    except jwt.InvalidTokenError:
        raise invalid_token() from None
    user = await session.get(User, claims["sub"])
    if user is None:
        raise invalid_token()
    return user


CurrentUser = Annotated[User, Depends(current_user)]


@router.get("/config")
async def read_config() -> AuthConfig:
    if not settings.oidc_issuer or not settings.oidc_client_id:
        return AuthConfig(oidc=None, dev=settings.dev_sign_in)
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
        ),
        dev=False,
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


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def expired_link() -> HTTPException:
    return HTTPException(
        status.HTTP_404_NOT_FOUND, "Sign-in link has expired or was already used"
    )


# The CLI prints a link to approve anywhere, then polls until it's approved
@router.post("/cli", status_code=status.HTTP_201_CREATED)
async def start_cli_login(session: Session) -> CliLoginStarted:
    secret = secrets.token_urlsafe(32)
    login = CliLogin(
        secret_hash=hash_secret(secret),
        expires_at=datetime.now(UTC) + cli_login_lifetime,
    )
    session.add(login)
    await session.commit()
    return CliLoginStarted(id=login.id, secret=secret, expires_at=login.expires_at)


@router.post("/cli/{login_id}", status_code=status.HTTP_204_NO_CONTENT)
async def approve_cli_login(login_id: str, user: CurrentUser, session: Session) -> None:
    login = await session.get(CliLogin, login_id)
    if login is None or login.user_id or login.expires_at <= datetime.now(UTC):
        raise expired_link()
    login.user_id = user.id
    session.add(login)
    await session.commit()


@router.post("/cli/{login_id}/token", response_model=Token)
async def claim_cli_login(
    login_id: str, body: CliLoginClaim, session: Session
) -> Token | Response:
    login = await session.get(CliLogin, login_id)
    if (
        login is None
        or login.expires_at <= datetime.now(UTC)
        or not hmac.compare_digest(login.secret_hash, hash_secret(body.secret))
    ):
        raise expired_link()
    # Not approved in the browser yet
    if login.user_id is None:
        return Response(status_code=status.HTTP_202_ACCEPTED)
    user = await session.get(User, login.user_id)
    if user is None:
        raise expired_link()
    await session.delete(login)
    await session.commit()
    return create_token(user)


async def find_or_create_user(
    session: Session, provider: Provider, subject: str
) -> User:
    query = select(User).where(
        col(User.provider) == provider, col(User.subject) == subject
    )
    result = await session.exec(query)
    user = result.first()
    if user:
        return user
    user = User(provider=provider, subject=subject)
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        # A concurrent first sign-in created the user, so this one finds it
        await session.rollback()
        return await find_or_create_user(session, provider, subject)
    return user


@dev_router.post("/dev")
async def sign_in_as_dev(session: Session) -> Token:
    # Google's subjects are numeric, so this can't be a real account
    user = await find_or_create_user(session, Provider.google, "dev")
    user.email = "dev@localhost"
    user.name = "Dev User"
    session.add(user)
    await session.commit()
    return create_token(user)


@oidc_router.post("/token")
async def sign_in(body: SignIn, session: Session) -> Token:
    try:
        info = await oidc.read_userinfo(
            body.code, body.code_verifier, body.redirect_uri
        )
    except oidc.OidcError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error

    user = await find_or_create_user(session, settings.oidc_provider, info.sub)
    # Kept current, since users can change them at the provider
    user.email = info.email
    user.name = info.name
    session.add(user)
    await session.commit()
    return create_token(user)
