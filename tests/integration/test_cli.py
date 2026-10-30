from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    env = {
        **os.environ,
        "PYTHONPATH": str(ROOT / "src"),
        "WB_ROOT": str(ROOT),
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
    }
    return subprocess.run(
        [sys.executable, "-m", "workbench", *args],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=30,
    )


def test_version_json() -> None:
    result = run_cli("version", "--json")
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["name"] == "workbench"
    assert payload["python"].startswith("3.")


def test_doctor_json() -> None:
    result = run_cli("doctor", "--json")
    payload = json.loads(result.stdout)
    assert payload["version"]
    assert any(check["name"] == "python" for check in payload["checks"])
    assert result.returncode in {0, 1}


def test_help_without_command() -> None:
    result = run_cli()
    assert result.returncode == 2
    assert "usage" in result.stderr.lower()
