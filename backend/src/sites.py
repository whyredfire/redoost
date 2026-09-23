from fastapi import APIRouter, HTTPException, Response, status

from .database import Session
from .models import Deployment, DeploymentState

# Only called by Nginx; not exposed publicly
router = APIRouter(prefix="/internal/sites", include_in_schema=False)


@router.get("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def resolve_site(slug: str, session: Session, response: Response) -> None:
    deployment = await session.get(Deployment, slug)
    # Nginx's auth_request only understands 2xx, 401 and 403
    if deployment is None or deployment.state != DeploymentState.ready:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Site not available")
    response.headers["X-Site-Spa"] = "1" if deployment.spa else "0"
