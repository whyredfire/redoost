import sys
import time

import pytest

from redoost.spinner import Spinner


def test_prints_once_outside_a_terminal(capsys: pytest.CaptureFixture[str]) -> None:
    status = Spinner("Uploading 3 files", quiet=False)
    with status:
        status.update("Uploading 1 of 3 files")

    assert capsys.readouterr().err == "Uploading 3 files…\n"


def test_stays_quiet_for_json(capsys: pytest.CaptureFixture[str]) -> None:
    with Spinner("Uploading 3 files", quiet=True):
        pass

    assert capsys.readouterr().err == ""


def test_animates_in_a_terminal(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sys.stderr, "isatty", lambda: True)
    status = Spinner("Uploading 0 of 3 files", quiet=False)
    with status:
        status.update("Uploading 2 of 3 files")
        time.sleep(0.2)

    err = capsys.readouterr().err
    assert "Uploading 2 of 3 files" in err
    # The status line is cleared once the work is done
    assert err.endswith("\r\033[K")
