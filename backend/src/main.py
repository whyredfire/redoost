import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Literal

import uvicorn
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from .database import check_database, create_tables
from .deployments import router as deployments_router
from .storage import check_storage


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    await create_tables()
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(deployments_router)


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
    uvicorn.run(app, host="0.0.0.0", port=8000)
