from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

from src.config import settings

PYPROJECT = Path(__file__).parent.parent / "pyproject.toml"


def test_migrations_match_models(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database = tmp_path / "redoost.db"
    monkeypatch.setattr(settings, "database_url", f"sqlite+aiosqlite:///{database}")
    config = Config(toml_file=PYPROJECT)

    command.upgrade(config, "head")
    # Fails when a model changed without a migration
    command.check(config)
    command.downgrade(config, "base")
