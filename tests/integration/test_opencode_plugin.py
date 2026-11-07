from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
OPENCODE_BIN = os.environ.get("OPENCODE_BIN")


@pytest.mark.skipif(not OPENCODE_BIN, reason="OPENCODE_BIN not set")
def test_opencode_loads_plugin_generated_reference(tmp_path: Path) -> None:
    opencode = Path(OPENCODE_BIN)
    if not opencode.is_file():
        pytest.skip(f"OPENCODE_BIN does not exist: {opencode}")

    subprocess.run(["git", "init", "--quiet", str(tmp_path)], check=True)
    config_dir = tmp_path / ".opencode" / "config"
    plugin_dir = tmp_path / ".opencode" / "plugins"
    config_dir.mkdir(parents=True)
    plugin_dir.mkdir(parents=True)
    shutil.copy2(
        ROOT / ".opencode" / "config" / "project-mapping.json",
        config_dir / "project-mapping.json",
    )
    shutil.copy2(ROOT / ".opencode" / "plugins" / "projects.ts", plugin_dir / "projects.ts")

    (tmp_path / "smoke-project" / ".git").mkdir(parents=True)
    (tmp_path / "smoke-project" / "AGENTS.md").write_text("# Smoke Project\n", encoding="utf-8")
    (tmp_path / "opencode.json").write_text(
        json.dumps({"reference": {".workbench": {"path": "."}}}),
        encoding="utf-8",
    )

    home = tmp_path / "home"
    env = {
        **os.environ,
        "HOME": str(home),
        "USERPROFILE": str(home),
        "XDG_CONFIG_HOME": str(home / "config"),
        "XDG_DATA_HOME": str(home / "data"),
        "XDG_CACHE_HOME": str(home / "cache"),
        "WB_PYTHON": sys.executable,
        "PYTHONPATH": str(ROOT / "src"),
        "WB_PROJECTS_SYNC_TTL_MS": "0",
        "PYTHONUTF8": "1",
    }
    result = subprocess.run(
        [str(opencode), "debug", "config", "--print-logs"],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
    )

    combined = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, combined
    assert '"smoke-project"' in result.stdout, combined
    assert '"smoke-project": "./smoke-project"' in result.stdout, combined
    assert "schema rejection" not in combined.lower(), combined
