import asyncio
from typing import Literal

import uvicorn
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError

from .config import settings
from .database import check_database, create_db_engine
from .storage import S3Storage

app = FastAPI()
engine = create_db_engine(settings.database_url)
storage = S3Storage(settings)


class HealthResponse(BaseModel):
    status: Literal["ok", "unavailable"]


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse | JSONResponse:
    try:
        await asyncio.gather(check_database(engine), storage.check_connection())
    except BotoCoreError, ClientError, ConnectionError, SQLAlchemyError:
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return HealthResponse(status="ok")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
