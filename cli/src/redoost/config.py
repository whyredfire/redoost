import json
import os
import tempfile
from pathlib import Path

default_server = "https://redoost.whyredfire.dev"


def config_path() -> Path:
    base = os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config"
    return Path(base) / "redoost" / "config.json"


def load_tokens() -> dict[str, str]:
    try:
        tokens = json.loads(config_path().read_text()).get("tokens", {})
    except FileNotFoundError:
        return {}
    # Unreadable, so signed out; the next login replaces it
    except (ValueError, AttributeError):
        return {}
    return tokens


def save_tokens(tokens: dict[str, str]) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # Created so only the user can read their tokens, then swapped in whole, so an
    # interrupted write never leaves half a file
    with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as file:
        file.write(json.dumps({"tokens": tokens}, indent=2))
    os.replace(file.name, path)
