import json
import os
from pathlib import Path

default_server = "https://redoost.whyredfire.dev"


def config_path() -> Path:
    base = os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config"
    return Path(base) / "redoost" / "config.json"


def load_tokens() -> dict[str, str]:
    try:
        text = config_path().read_text()
    except FileNotFoundError:
        return {}
    return json.loads(text).get("tokens", {})


def save_tokens(tokens: dict[str, str]) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # Only the user can read their tokens
    path.touch(mode=0o600, exist_ok=True)
    path.chmod(0o600)
    path.write_text(json.dumps({"tokens": tokens}, indent=2))
