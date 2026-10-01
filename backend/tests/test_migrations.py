import asyncio
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlmodel import SQLModel

from src import database
from src.config import settings

PYPROJECT = Path(__file__).parent.parent / "pyproject.toml"


async def drop_tables() -> None:
    async with database.engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.drop_all)
        await connection.execute(text("DROP TABLE IF EXISTS alembic_version"))
        # drop_all skips enum types whose table is already gone
        await connection.execute(text("DROP TYPE IF EXISTS deploymentstate"))


def test_migrations_match_models(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    if settings.database_url.startswith("sqlite"):
        path = tmp_path / "redoost.db"
        monkeypatch.setattr(settings, "database_url", f"sqlite+aiosqlite:///{path}")
    else:
        # Other tests create the tables straight from the models
        asyncio.run(drop_tables())
    config = Config(toml_file=PYPROJECT)

    command.upgrade(config, "head")
    # Fails when a model changed without a migration
    command.check(config)
    # Fails when a downgrade leaves objects behind
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    command.downgrade(config, "base")
