import hashlib
import hmac
import mimetypes
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel.ext.asyncio.session import AsyncSession

from .database import get_session
from .models import Deployment, DeploymentBase, DeploymentCreated, Manifest

router = APIRouter(prefix="/api/deployments", tags=["deployments"])
mime_types = mimetypes.MimeTypes()

Session = Annotated[AsyncSession, Depends(get_session)]
Credentials = Annotated[HTTPAuthorizationCredentials, Depends(HTTPBearer())]


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def content_type(path: str) -> str:
    mime_type, encoding = mime_types.guess_file_type(path)
    # Compressed files would otherwise get the MIME type of their contents
    return mime_type if mime_type and not encoding else "application/octet-stream"


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


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_deployment(manifest: Manifest, session: Session) -> DeploymentCreated:
    token = secrets.token_urlsafe(32)
    deployment = Deployment(
        token_hash=hash_token(token),
        file_count=len(manifest.files),
        total_size=sum(file.size for file in manifest.files),
    )
    session.add(deployment)
    await session.commit()
    return DeploymentCreated(**deployment.model_dump(), token=token)


@router.get("/{slug}")
async def read_deployment(
    deployment: Annotated[Deployment, Depends(get_deployment)],
) -> DeploymentBase:
    return deployment
