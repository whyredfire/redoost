import json
from pathlib import Path

import pytest

from redoost import main, updates

SERVER = "https://redoost.example.com"
WHEEL = (
    "https://github.com/whyredfire/redoost/releases/download/v0.4.0/"
    "redoost-0.4.0-py3-none-any.whl"
)


@pytest.fixture(autouse=True)
def installed(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    monkeypatch.setattr(updates, "version", lambda name: "0.3.1")
    monkeypatch.setattr(main, "version", lambda name: "0.3.1")


def serves(monkeypatch: pytest.MonkeyPatch, found: str | None) -> list[str]:
    asked: list[str] = []

    def server_version(server: str) -> str | None:
        asked.append(server)
        return found

    monkeypatch.setattr(updates, "server_version", server_version)
    return asked


@pytest.mark.parametrize(
    ("available", "newer"),
    [
        ("0.4.0", "0.4.0"),
        ("0.4.0-abc1234", "0.4.0"),
        ("0.3.1-abc1234", None),
        ("0.3.0", None),
        ("dev", None),
        (None, None),
    ],
)
def test_newer_release(available: str | None, newer: str | None) -> None:
    assert updates.newer_release(available) == newer


def test_checks_at_most_daily(monkeypatch: pytest.MonkeyPatch) -> None:
    asked = serves(monkeypatch, "0.4.0")
    now = 1_000_000.0
    monkeypatch.setattr(updates.time, "time", lambda: now)

    assert updates.cached_server_version(SERVER) == "0.4.0"
    assert updates.cached_server_version(SERVER) == "0.4.0"
    assert len(asked) == 1
    now += updates.check_every
    updates.cached_server_version(SERVER)
    assert len(asked) == 2


def test_notice_only_in_terminals(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    serves(monkeypatch, "0.4.0")
    monkeypatch.setattr(main.sys.stderr, "isatty", lambda: True)

    main.main(["logout", "--server", SERVER])
    assert "A newer redoost CLI is available (0.4.0" in capsys.readouterr().err
    main.main(["logout", "--server", SERVER, "--json"])
    assert "newer" not in capsys.readouterr().err

    monkeypatch.setattr(main.sys.stderr, "isatty", lambda: False)
    main.main(["logout", "--server", SERVER])
    assert "newer" not in capsys.readouterr().err


def test_update_when_up_to_date(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    serves(monkeypatch, "0.3.1")

    main.main(["update", "--server", SERVER])
    assert capsys.readouterr().out == "redoost 0.3.1 is up to date\n"


def test_update_installs_the_servers_release(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    serves(monkeypatch, "0.4.0-abc1234")
    monkeypatch.setattr(
        updates, "install_command", lambda spec: ["uv", "tool", "install", spec]
    )
    ran: list[list[str]] = []

    class Done:
        returncode = 0

    def run(command: list[str], check: bool) -> Done:
        ran.append(command)
        return Done()

    monkeypatch.setattr(main.subprocess, "run", run)

    main.main(["update", "--server", SERVER])
    assert ran == [["uv", "tool", "install", WHEEL]]
    assert capsys.readouterr().out == "Updated to redoost 0.4.0\n"


def test_update_explains_unknown_installs(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    serves(monkeypatch, "0.4.0")
    monkeypatch.setattr(updates, "install_command", lambda spec: None)

    main.main(["update", "--server", SERVER, "--json"])
    assert json.loads(capsys.readouterr().out) == {
        "version": "0.4.0",
        "updated": False,
        "install": [
            f"uv tool install --force {WHEEL}",
            f"pipx install --force {WHEEL}",
        ],
    }


@pytest.mark.parametrize("found", [None, "dev"])
def test_update_needs_the_servers_version(
    monkeypatch: pytest.MonkeyPatch, found: str | None
) -> None:
    serves(monkeypatch, found)

    with pytest.raises(SystemExit) as exit:
        main.main(["update", "--server", SERVER])
    assert str(exit.value) == f"error: Couldn't tell which version {SERVER} runs."
