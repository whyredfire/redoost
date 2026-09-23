import hashlib
import hmac
import secrets
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

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


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


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
async def create_deployment(manifest: Manifest, session: Session) -> DeploymentCreated:
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
