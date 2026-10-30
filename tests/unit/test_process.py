from __future__ import annotations

import json
from argparse import Namespace
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


def write_process(root: Path, processes_dir: Path, name: str, gate: str = "manual") -> None:
    directory = processes_dir / name
    directory.mkdir(parents=True)
    data = {
        "name": name,
        "description": name,
        "version": 1,
        "stages": [{"id": "build", "name": "Build", "agent": None, "gate": gate}],
        "gates": [{"id": gate, "agent": "revisor", "blocking": True}],
    }
    (directory / "process.json").write_text(json.dumps(data), encoding="utf-8")


def test_list_processes_includes_project_processes(tmp_path: Path) -> None:
    write_process(tmp_path, tmp_path / ".opencode" / "processes", "global")
    write_process(tmp_path, tmp_path / "projects" / "demo" / "processes", "custom")
    items = engine.list_processes(tmp_path, project="demo")
    by_name = {item["name"]: item for item in items}
    assert by_name["global"]["source"] == "global"
    assert by_name["custom"]["source"] == "project"


def test_project_process_overrides_global_with_same_name(tmp_path: Path) -> None:
    write_process(tmp_path, tmp_path / ".opencode" / "processes", "custom")
    project_dir = tmp_path / "projects" / "demo" / "processes"
    write_process(tmp_path, project_dir, "custom")
    (project_dir / "custom" / "process.json").write_text(
        json.dumps(
            {
                "name": "custom",
                "description": "project version",
                "version": 1,
                "stages": [{"id": "build", "name": "Build"}],
            }
        ),
        encoding="utf-8",
    )
    definition = engine.load_process("custom", "demo", tmp_path)
    assert definition.path == project_dir / "custom" / "process.json"


def test_validate_project_processes(tmp_path: Path, monkeypatch, capsys) -> None:
    write_process(tmp_path, tmp_path / "projects" / "demo" / "processes", "custom")
    monkeypatch.setenv("WB_ROOT", str(tmp_path))
    assert engine._run_validate(Namespace(name=None, project="demo")) == 0
    assert "custom" in capsys.readouterr().out


def test_gate_uses_project_process(tmp_path: Path, monkeypatch, capsys) -> None:
    write_process(tmp_path, tmp_path / "projects" / "demo" / "processes", "custom")
    monkeypatch.setenv("WB_ROOT", str(tmp_path))
    definition = engine.load_process("custom", "demo", tmp_path)
    state = engine.create_state(definition, "demo-state", "demo")
    engine.save_state(state, tmp_path)
    args = Namespace(
        name="custom",
        gate="manual",
        slug="demo-state",
        status="approved",
        project="demo",
    )
    assert engine._run_gate(args) == 0
    assert '"status": "passed"' in capsys.readouterr().out
