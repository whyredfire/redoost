import asyncio
from typing import Literal

import uvicorn
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from . import auth
from .config import settings
from .database import check_database
from .deployments import router as deployments_router
from .sites import router as sites_router
from .storage import check_storage

# Bodies are read before requests are authenticated, so anyone could send a huge one;
# the largest manifest, of 2000 files with long paths, is a few MiB
max_body_size = 8 * 1024**2


class LimitBodySize:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        received = 0

        async def limited() -> Message:
            nonlocal received
            message = await receive()
            received += len(message.get("body", b""))
            if received > max_body_size:
                raise HTTPException(
                    status.HTTP_413_CONTENT_TOO_LARGE, "Request body is too large"
                )
            return message

        await self.app(scope, limited, send)


app = FastAPI()
app.add_middleware(LimitBodySize)
app.include_router(auth.router)
if settings.oidc_issuer:
    app.include_router(auth.oidc_router)
else:
    app.include_router(auth.dev_router)
app.include_router(deployments_router)
app.include_router(sites_router)


class HealthResponse(BaseModel):
    status: Literal["ok", "unavailable"] = Field(
        description="Whether the database and S3 are reachable"
    )
    version: str = Field(description="Deployed version, e.g. 0.1.6-abc1234")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse | JSONResponse:
    try:
        await asyncio.gather(check_database(), check_storage())
    except BotoCoreError, ClientError, ConnectionError, SQLAlchemyError:
        return JSONResponse(
            status_code=503,
            content=HealthResponse(
                status="unavailable", version=settings.version
            ).model_dump(),
        )
    return HealthResponse(status="ok", version=settings.version)


class VersionResponse(BaseModel):
    version: str = Field(description="Deployed version, e.g. 0.1.6-abc1234")


# The dashboard's origin only forwards /api, which is where the CLI looks
@app.get("/api/version")
async def read_version() -> VersionResponse:
    return VersionResponse(version=settings.version)


if __name__ == "__main__":
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=settings.reload)
