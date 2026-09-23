import hashlib
import hmac
import secrets
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import col, select

from .database import Session
from .models import (
    Deployment,
    DeploymentBase,
    DeploymentCreated,
    DeploymentState,
    Manifest,
)
from .storage import count_objects, sign_uploads

router = APIRouter(prefix="/api/deployments", tags=["deployments"])

Credentials = Annotated[HTTPAuthorizationCredentials, Depends(HTTPBearer())]
OptionalCredentials = Annotated[
    HTTPAuthorizationCredentials | None, Depends(HTTPBearer(auto_error=False))
]


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def check_token(session: Session, token_hash: str) -> None:
    # Only tokens issued with an earlier deployment are valid
    query = select(Deployment.slug).where(Deployment.token_hash == token_hash)
    result = await session.exec(query.limit(1))
    if result.first() is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid token")


async def get_deployment(
    slug: str, session: Session, credentials: Credentials
) -> Deployment:
    deployment = await session.get(Deployment, slug)
    if deployment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deployment not found")
    if not hmac.compare_digest(
        deployment.token_hash, hash_token(credentials.credentials)
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid deployment token")
    return deployment


OwnedDeployment = Annotated[Deployment, Depends(get_deployment)]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_deployment(
    manifest: Manifest, session: Session, credentials: OptionalCredentials
) -> DeploymentCreated:
    if credentials:
        token = credentials.credentials
        await check_token(session, hash_token(token))
    else:
        token = secrets.token_urlsafe(32)
    deployment = Deployment(
        token_hash=hash_token(token),
        file_count=len(manifest.files),
        total_size=sum(file.size for file in manifest.files),
        spa=all(file.path != "404.html" for file in manifest.files),
    )
    upload_url, uploads = await sign_uploads(deployment.slug, manifest.files)
    session.add(deployment)
    await session.commit()
    return DeploymentCreated(
        **deployment.model_dump(), token=token, upload_url=upload_url, uploads=uploads
    )


@router.get("")
async def list_deployments(
    session: Session, credentials: Credentials
) -> list[DeploymentBase]:
    token_hash = hash_token(credentials.credentials)
    await check_token(session, token_hash)
    query = (
        select(Deployment)
        .where(Deployment.token_hash == token_hash)
        .where(Deployment.state == DeploymentState.ready)
        .order_by(col(Deployment.created_at).desc())
    )
    result = await session.exec(query)
    return list(result.all())


@router.get("/{slug}")
async def read_deployment(deployment: OwnedDeployment) -> DeploymentBase:
    return deployment


@router.post("/{slug}/complete")
async def complete_deployment(
    deployment: OwnedDeployment, session: Session
) -> DeploymentBase:
    if deployment.state == DeploymentState.ready:
        return deployment
    if deployment.expires_at < datetime.now(UTC):
        raise HTTPException(status.HTTP_410_GONE, "Upload window has closed")

    # Policies only allow the manifest's files with their exact content
    uploaded = await count_objects(deployment.slug)
    if uploaded != deployment.file_count:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{uploaded} of {deployment.file_count} files uploaded",
        )

    deployment.state = DeploymentState.ready
    session.add(deployment)
    await session.commit()
    return deployment
