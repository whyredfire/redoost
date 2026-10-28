import pytest
from pydantic import ValidationError

from src.config import Settings


@pytest.mark.parametrize(
    "url", [None, "sqlite+aiosqlite:///./redoost.db", "postgresql://host/redoost"]
)
def test_database_must_be_postgres(
    monkeypatch: pytest.MonkeyPatch, url: str | None
) -> None:
    if url is None:
        monkeypatch.delenv("REDOOST_DATABASE_URL")
    else:
        monkeypatch.setenv("REDOOST_DATABASE_URL", url)

    with pytest.raises(ValidationError):
        Settings()  # pyright: ignore[reportCallIssue]


def test_settings_load_prefixed_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REDOOST_S3_BUCKET", "test-sites")
    monkeypatch.setenv("REDOOST_LOG_LEVEL", "VERBOSE")

    settings = Settings()  # pyright: ignore[reportCallIssue]

    assert settings.s3_bucket == "test-sites"
    assert settings.log_level == "VERBOSE"


def test_internal_and_public_storage_endpoints_are_distinct_settings() -> None:
    settings = Settings(  # pyright: ignore[reportCallIssue]
        s3_endpoint="http://garage:3900",
        s3_public_endpoint="https://uploads.example.com",
    )

    assert str(settings.s3_endpoint) == "http://garage:3900/"
    assert str(settings.s3_public_endpoint) == "https://uploads.example.com/"


def test_upload_window_is_capped_at_24_hours(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REDOOST_UPLOAD_WINDOW", "PT25H")

    with pytest.raises(ValidationError):
        Settings()  # pyright: ignore[reportCallIssue]


@pytest.mark.parametrize("both", [False, True], ids=["neither", "both"])
def test_sign_in_needs_exactly_one_method(
    monkeypatch: pytest.MonkeyPatch, both: bool
) -> None:
    monkeypatch.setenv("REDOOST_DEV_SIGN_IN", str(both).lower())
    if both:
        monkeypatch.setenv("REDOOST_OIDC_ISSUER", "https://accounts.google.com")
        monkeypatch.setenv("REDOOST_OIDC_CLIENT_ID", "redoost")
        monkeypatch.setenv("REDOOST_OIDC_CLIENT_SECRET", "secret")

    with pytest.raises(ValidationError, match="either an OIDC issuer or dev sign-in"):
        Settings()  # pyright: ignore[reportCallIssue]
