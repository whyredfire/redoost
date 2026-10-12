import json
import re
import shutil
import subprocess
import sys
import time
from importlib.metadata import version
from pathlib import Path

import httpx2

from . import config

repository = "https://github.com/whyredfire/redoost"
# Checked at most daily, so commands rarely wait on the network
check_every = 24 * 60 * 60


def release(text: str | None) -> tuple[int, ...] | None:
    # Builds between releases look like 0.3.1-abc1234
    match = re.match(r"(\d+)\.(\d+)\.(\d+)", text or "")
    return tuple(int(part) for part in match.groups()) if match else None


def server_version(server: str) -> str | None:
    try:
        response = httpx2.get(f"{server}/api/version", timeout=1)
        response.raise_for_status()
        return response.json()["version"]
    except (httpx2.HTTPError, ValueError, KeyError):
        return None


def cached_server_version(server: str) -> str | None:
    path = config.config_path().with_name("updates.json")
    try:
        cache = json.loads(path.read_text())
    except (OSError, ValueError):
        cache = {}
    entry = cache.get(server)
    if entry and time.time() - entry["checked"] < check_every:
        return entry["version"]

    found = server_version(server)
    cache[server] = {"checked": time.time(), "version": found}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache))
    return found


def newer_release(available: str | None) -> str | None:
    """The server's release, if it's newer than this CLI."""
    theirs = release(available)
    ours = release(version("redoost"))
    if theirs is None or ours is None or theirs <= ours:
        return None
    return ".".join(map(str, theirs))


def notify(server: str) -> None:
    newer = newer_release(cached_server_version(server))
    if newer:
        print(
            f"A newer redoost CLI is available ({newer}, you have "
            f"{version('redoost')}). Run redoost update.",
            file=sys.stderr,
        )


def wheel_url(release_version: str) -> str:
    return (
        f"{repository}/releases/download/v{release_version}/"
        f"redoost-{release_version}-py3-none-any.whl"
    )


def install_command(spec: str) -> list[str] | None:
    """How to reinstall the CLI, judged by which tool installed this copy."""
    here = Path(sys.prefix).resolve()
    tools = [
        (["uv", "tool", "dir"], ["uv", "tool", "install", "--force", spec]),
        (
            ["pipx", "environment", "--value", "PIPX_LOCAL_VENVS"],
            ["pipx", "install", "--force", spec],
        ),
    ]
    for find_dir, install in tools:
        if shutil.which(find_dir[0]) is None:
            continue
        found = subprocess.run(find_dir, capture_output=True, text=True, check=False)
        if found.returncode != 0:
            continue
        tool_dir = Path(found.stdout.strip()).resolve()
        if here.is_relative_to(tool_dir):
            return install
    return None
