from __future__ import annotations

from pathlib import Path

from workbench.commands import sprint


def test_load_tasks_returns_seven() -> None:
    tasks = sprint.load_tasks()
    assert len(tasks) == 7
    assert sum(1 for task in tasks if task["tipo"] == "condicional") == 3
    assert sum(1 for task in tasks if task["tipo"] == "fixa") == 4


def test_validate_module_ok() -> None:
    result = sprint.validate_module(sprint.load_tasks())
    assert result == {"ok": True, "errors": []}


def test_validate_module_detects_story_points() -> None:
    tasks = sprint.load_tasks()
    tasks[0] = {**tasks[0], "descricaoCurta": "usar Story Points"}
    result = sprint.validate_module(tasks)
    assert result["ok"] is False
    assert any("Story Points" in error for error in result["errors"])


def test_scan_for_story_points(tmp_path: Path) -> None:
    document = tmp_path / ".opencode" / "note.md"
    document.parent.mkdir(parents=True)
    document.write_text("Story Points não são usados\n", encoding="utf-8")
    result = sprint.scan_for_story_points(root=tmp_path)
    assert result["ok"] is False
    assert result["count"] == 1


def test_scan_for_broken_references(tmp_path: Path) -> None:
    document = tmp_path / ".opencode" / "note.md"
    document.parent.mkdir(parents=True)
    document.write_text("Veja @.opencode/config/missing.json\n", encoding="utf-8")
    result = sprint.scan_for_broken_references(root=tmp_path)
    assert result["ok"] is False
    assert "arquivo não existe" in result["errors"][0]


def test_validate_sprint_branch() -> None:
    assert sprint.validate_sprint_branch("feat/TASK-1234")["valid"] is True
    assert sprint.validate_sprint_branch("fix/TASK-1234")["valid"] is False
