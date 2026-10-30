from __future__ import annotations

import json
from pathlib import Path

from workbench import process_engine as engine


def test_default_process_is_valid() -> None:
    definition = engine.load_process("default")
    assert definition.name == "default"
    assert engine.validate_process(definition) == []
    assert definition.license == "MIT"


def test_plan_payload() -> None:
    definition = engine.load_process("default")
    plan = engine.plan_payload(definition)
    assert plan["process"] == "default"
    assert plan["stages"][0]["id"] == "discover"
    assert plan["gates"]


def test_state_roundtrip(tmp_path: Path) -> None:
    definition = engine.load_process("default")
    state = engine.create_state(definition, "demo", "workbench")
    path = engine.save_state(state, tmp_path)
    assert path.is_file()
    loaded = engine.load_state("default", "demo", tmp_path)
    assert loaded is not None
    assert loaded["process"] == "default"
    assert engine.resume_prompt("default", "demo", tmp_path)["exists"] is True
    assert engine.resume_prompt("default", "missing", tmp_path)["exists"] is False


def test_run_manual_gate(tmp_path: Path) -> None:
    definition = engine.load_process("default")
    state = engine.create_state(definition, "demo", "workbench")
    result = engine.run_gate(
        definition, state, "plan-review", root=tmp_path, manual_status="approved"
    )
    assert result["status"] == "passed"
    assert state["gates"]["plan-review"]["status"] == "passed"


def test_run_command_gate(tmp_path: Path) -> None:
    process_dir = tmp_path / ".opencode" / "processes" / "sample"
    process_dir.mkdir(parents=True)
    data = {
        "name": "sample",
        "description": "sample",
        "version": 1,
        "stages": [{"id": "build", "name": "Build", "agent": None, "gate": "ok"}],
        "gates": [{"id": "ok", "command": "git --version", "blocking": True}],
    }
    (process_dir / "process.json").write_text(json.dumps(data), encoding="utf-8")
    definition = engine.load_process("sample", root=tmp_path)
    state = engine.create_state(definition, "demo", "workbench")
    result = engine.run_gate(definition, state, "ok", root=tmp_path)
    assert result["status"] == "passed"
    assert result["exit_code"] == 0
