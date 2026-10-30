from __future__ import annotations

import json
from pathlib import Path

from workbench.commands import doctor


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_collect_reports_python_and_config(tmp_path: Path) -> None:
    write_json(tmp_path / "opencode.json", {"mcp": {"mcp-image": {"enabled": True}}})
    write_json(
        tmp_path / ".opencode" / "config" / "project-mapping.json",
        {"projects": {"workbench": {"name": "Workbench"}}},
    )
    report = doctor.collect(tmp_path)
    checks = {item["name"]: item for item in report["checks"]}
    assert checks["python"]["status"] == "ok"
    assert checks["config"]["status"] == "ok"
    assert report["config"]["projects"] == ["workbench"]
    assert report["config"]["adapters"] == {"mcp-image": True}


def test_collect_reports_invalid_config(tmp_path: Path) -> None:
    report = doctor.collect(tmp_path)
    checks = {item["name"]: item for item in report["checks"]}
    assert checks["config"]["status"] == "error"
    assert "error" in report["config"]
