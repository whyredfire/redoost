import asyncio
from typing import Literal

import uvicorn
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from .config import settings
from .database import check_database
from .deployments import router as deployments_router
from .sites import router as sites_router
from .storage import check_storage

app = FastAPI()
app.include_router(deployments_router)
app.include_router(sites_router)


class HealthResponse(BaseModel):
    status: Literal["ok", "unavailable"] = Field(
        description="Whether the database and S3 are reachable"
    )


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse | JSONResponse:
    try:
        await asyncio.gather(check_database(), check_storage())
    except BotoCoreError, ClientError, ConnectionError, SQLAlchemyError:
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return HealthResponse(status="ok")


if __name__ == "__main__":
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=settings.reload)
