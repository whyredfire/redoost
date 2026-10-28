from pathlib import Path

from alembic import command
from alembic.config import Config

PYPROJECT = Path(__file__).parent.parent / "pyproject.toml"


# Other tests create the tables straight from the models, so it starts empty
def test_migrations_match_models(empty_database: None) -> None:
    config = Config(toml_file=PYPROJECT)

    command.upgrade(config, "head")
    # Fails when a model changed without a migration
    command.check(config)
    # Fails when a downgrade leaves objects behind
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    command.downgrade(config, "base")
