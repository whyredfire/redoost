import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

import jwt
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import col, delete, select, update

from . import oidc
from .config import Provider, settings
from .database import Session
from .models import (
    ApiToken,
    ApiTokenCreate,
    ApiTokenCreated,
    ApiTokenInfo,
    AuthConfig,
    CliLogin,
    CliLoginClaim,
    CliLoginStarted,
    Deployment,
    OidcConfig,
    Scope,
    SignIn,
    Token,
    TokenSource,
    User,
    UserBase,
    api_token_prefix,
)
from .storage import delete_sites

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Only one of these is served, depending on how users sign in
oidc_router = APIRouter(prefix="/api/auth", tags=["auth"])
dev_router = APIRouter(prefix="/api/auth", tags=["auth"])

token_lifetime = timedelta(days=30)
cli_login_lifetime = timedelta(minutes=10)
# Busy pipelines would otherwise write on every request
record_use_every = timedelta(minutes=1)

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


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


@dataclass
class Principal:
    user: User
    # The API token the request came with, or None for a dashboard session
    token: ApiToken | None


async def api_token_principal(session: Session, token: str) -> Principal:
    query = select(ApiToken).where(ApiToken.secret_hash == hash_secret(token))
    api_token = (await session.exec(query)).first()
    now = datetime.now(UTC)
    if api_token is None or (api_token.expires_at and api_token.expires_at <= now):
        raise invalid_token()
    user = await session.get(User, api_token.user_id)
    if user is None:
        raise invalid_token()
    if not api_token.last_used_at or now - api_token.last_used_at > record_use_every:
        api_token.last_used_at = now
        session.add(api_token)
        await session.commit()
    return Principal(user, api_token)


async def authenticate(session: Session, credentials: Credentials) -> Principal:
    if credentials.credentials.startswith(api_token_prefix):
        return await api_token_principal(session, credentials.credentials)
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
    return Principal(user, None)


Auth = Annotated[Principal, Depends(authenticate)]


async def current_user(auth: Auth) -> User:
    return auth.user


CurrentUser = Annotated[User, Depends(current_user)]


# A leaked token then can't make more tokens, or take over the account
async def signed_in_user(auth: Auth) -> User:
    if auth.token is not None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Tokens can't manage the account"
        )
    return auth.user


SignedInUser = Annotated[User, Depends(signed_in_user)]


# Reading comes with every scope, so only publishing and managing are checked
def needs(scope: Scope) -> Any:
    async def check(auth: Auth) -> None:
        if auth.token is not None and scope not in auth.token.scopes:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, f"This token can't {scope} sites"
            )

    return Depends(check)


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
async def delete_user(user: SignedInUser, session: Session) -> None:
    query = select(Deployment).where(Deployment.owner_id == user.id)
    result = await session.exec(query)
    deployments = result.all()
    # Files go first, so a failed delete leaves the account in place to retry
    await delete_sites(deployment.slug for deployment in deployments)
    for deployment in deployments:
        await session.delete(deployment)
    await session.delete(user)
    await session.commit()


def new_api_token(
    user: User,
    name: str,
    source: TokenSource,
    scopes: list[Scope],
    expires_at: datetime | None,
) -> tuple[ApiToken, str]:
    """A token and its secret, which is handed out once and kept only as a hash."""
    secret = api_token_prefix + secrets.token_urlsafe(32)
    api_token = ApiToken(
        name=name,
        secret_hash=hash_secret(secret),
        user_id=user.id,
        source=source,
        scopes=scopes,
        expires_at=expires_at,
    )
    return api_token, secret


@router.post("/tokens", status_code=status.HTTP_201_CREATED)
async def create_api_token(
    body: ApiTokenCreate, user: SignedInUser, session: Session
) -> ApiTokenCreated:
    api_token, secret = new_api_token(
        user, body.name, TokenSource.manual, body.scopes, body.expires_at
    )
    session.add(api_token)
    await session.commit()
    return ApiTokenCreated.model_validate(api_token, update={"token": secret})


@router.get("/tokens")
async def list_api_tokens(user: SignedInUser, session: Session) -> list[ApiTokenInfo]:
    query = (
        select(ApiToken)
        .where(ApiToken.user_id == user.id)
        .order_by(col(ApiToken.created_at).desc())
    )
    result = await session.exec(query)
    return [ApiTokenInfo.model_validate(api_token) for api_token in result.all()]


# Signs a CLI out; a dashboard session has no token to revoke
@router.delete("/tokens/current", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_current_token(auth: Auth, session: Session) -> None:
    if auth.token is not None:
        await session.delete(auth.token)
        await session.commit()


@router.delete("/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_token(token_id: str, user: SignedInUser, session: Session) -> None:
    api_token = await session.get(ApiToken, token_id)
    if api_token is None or api_token.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    await session.delete(api_token)
    await session.commit()


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


# One statement, so a link can only ever be approved once, by one user
@router.post("/cli/{login_id}", status_code=status.HTTP_204_NO_CONTENT)
async def approve_cli_login(
    login_id: str, user: SignedInUser, session: Session
) -> None:
    result = await session.exec(
        update(CliLogin)
        .where(col(CliLogin.id) == login_id)
        .where(col(CliLogin.user_id).is_(None))
        .where(col(CliLogin.expires_at) > datetime.now(UTC))
        .values(user_id=user.id)
    )
    if result.rowcount == 0:
        raise expired_link()
    await session.commit()


@router.post("/cli/{login_id}/token", response_model=Token)
async def claim_cli_login(
    login_id: str, body: CliLoginClaim, session: Session
) -> Token | Response:
    # Deleted as it's claimed, so it gives out one token at most
    claimed = await session.exec(
        delete(CliLogin)
        .where(col(CliLogin.id) == login_id)
        .where(col(CliLogin.secret_hash) == hash_secret(body.secret))
        .where(col(CliLogin.expires_at) > datetime.now(UTC))
        .where(col(CliLogin.user_id).is_not(None))
        .returning(col(CliLogin.user_id))
    )
    user_id = claimed.scalar_one_or_none()
    user = await session.get(User, user_id) if user_id else None
    if user is None:
        login = await session.get(CliLogin, login_id)
        # Not approved in the browser yet
        if (
            login
            and login.expires_at > datetime.now(UTC)
            and hmac.compare_digest(login.secret_hash, hash_secret(body.secret))
        ):
            return Response(status_code=status.HTTP_202_ACCEPTED)
        raise expired_link()
    # Revocable from the dashboard, unlike the session tokens the browser gets
    api_token, secret = new_api_token(
        user,
        body.name,
        TokenSource.cli,
        list(Scope),
        datetime.now(UTC) + token_lifetime,
    )
    session.add(api_token)
    await session.commit()
    return Token(token=secret, user=UserBase.model_validate(user))


async def sign_in_user(
    session: Session,
    provider: Provider,
    subject: str,
    email: str | None,
    name: str | None,
    picture: str | None = None,
) -> User:
    """Finds or creates the user in one statement, keeping their details current."""
    new = User(
        provider=provider, subject=subject, email=email, name=name, picture=picture
    )
    upsert = insert(User).values(**new.model_dump())
    upsert = upsert.on_conflict_do_update(
        index_elements=[col(User.provider), col(User.subject)],
        set_={
            "email": upsert.excluded.email,
            "name": upsert.excluded.name,
            "picture": upsert.excluded.picture,
        },
    ).returning(col(User.id))
    user_id = (await session.exec(upsert)).scalar_one()
    await session.commit()
    user = await session.get(User, user_id, populate_existing=True)
    assert user is not None
    return user


@dev_router.post("/dev")
async def sign_in_as_dev(session: Session) -> Token:
    # Google's subjects are numeric, so this can't be a real account
    user = await sign_in_user(
        session, Provider.google, "dev", "dev@localhost", "Dev User"
    )
    return create_token(user)


@oidc_router.post("/token")
async def sign_in(body: SignIn, session: Session) -> Token:
    try:
        info = await oidc.read_userinfo(
            body.code, body.code_verifier, body.redirect_uri
        )
    except oidc.OidcError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error

    # Kept current, since users can change them at the provider
    user = await sign_in_user(
        session, settings.oidc_provider, info.sub, info.email, info.name, info.picture
    )
    return create_token(user)
