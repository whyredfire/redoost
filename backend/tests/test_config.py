import pytest

from src.config import Settings


def test_database_uses_local_sqlite_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("REDOOST_DATABASE_URL")

    assert Settings().database_url == "sqlite+aiosqlite:///./redoost.db"


def test_settings_load_prefixed_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REDOOST_S3_BUCKET", "test-sites")
    monkeypatch.setenv("REDOOST_LOG_LEVEL", "VERBOSE")

    settings = Settings()

    assert settings.s3_bucket == "test-sites"
    assert settings.log_level == "VERBOSE"


def test_internal_and_public_storage_endpoints_are_distinct_settings() -> None:
    settings = Settings(
        s3_endpoint="http://garage:3900",
        s3_public_endpoint="https://uploads.example.com",
    )

    assert str(settings.s3_endpoint) == "http://garage:3900/"
    assert str(settings.s3_public_endpoint) == "https://uploads.example.com/"
