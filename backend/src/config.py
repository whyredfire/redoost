from typing import Literal

from pydantic import AnyHttpUrl, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="REDOOST_", extra="ignore")

    log_level: Literal["INFO", "VERBOSE"]
    database_url: str = "sqlite+aiosqlite:///./redoost.db"

    s3_endpoint: AnyHttpUrl
    s3_public_endpoint: AnyHttpUrl
    s3_region: str
    s3_bucket: str
    s3_access_key_id: str
    s3_secret_access_key: SecretStr


settings = Settings()
