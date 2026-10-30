from __future__ import annotations

import sys

import pytest

from workbench import process
from workbench.errors import ExternalCommandError, MissingDependencyError, WorkbenchError


def test_run_success() -> None:
    result = process.run([sys.executable, "-c", "print('ok')"])
    assert result.ok
    assert result.stdout.strip() == "ok"
    assert result.duration_ms >= 0


def test_run_missing_command() -> None:
    with pytest.raises(MissingDependencyError):
        process.run(["definitely-not-a-command-workbench"])


def test_run_timeout() -> None:
    with pytest.raises(WorkbenchError, match="Timeout"):
        process.run([sys.executable, "-c", "import time; time.sleep(2)"], timeout=0.2)


def test_run_check() -> None:
    with pytest.raises(ExternalCommandError):
        process.run([sys.executable, "-c", "raise SystemExit(2)"], check=True)
