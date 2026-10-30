from __future__ import annotations

from workbench.commands import release


def test_extract_task_ids_and_pr() -> None:
    commits = [
        {"hash": "a", "message": "feat: add TASK-123 (#42)"},
        {"hash": "b", "message": "fix: AB#77"},
        {"hash": "c", "message": "chore: nothing"},
    ]
    assert release.extract_task_ids(commits) == ["TASK-123", "AB#77"]
    assert release.extract_pr_number(commits[0]["message"]) == "42"
    assert release.extract_pr_number("no pr") is None


def test_suggest_next_tag(monkeypatch) -> None:
    monkeypatch.setattr(release, "get_last_tag", lambda: None)
    assert release.suggest_next_tag("v1.2.3") == "v1.2.4"
    assert release.suggest_next_tag("v2.0.0") == "v2.0.1"
    assert release.suggest_next_tag("invalid") == "v1.0.0"
    assert release.suggest_next_tag(None) == "v1.0.0"


def test_group_work_items_order() -> None:
    items = [
        {"id": 1, "fields": {"System.WorkItemType": "Task"}},
        {"id": 2, "fields": {"System.WorkItemType": "Bug"}},
        {"id": 3, "fields": {"System.WorkItemType": "Feature"}},
        {"id": 4, "fields": {"System.WorkItemType": "Custom"}},
    ]
    grouped = release.group_work_items(items)
    assert list(grouped) == ["Feature", "Bug", "Task"]
    assert len(grouped["Task"]) == 2


def test_generate_release_notes(monkeypatch) -> None:
    monkeypatch.setenv("ADO_ORG", "your-org")
    monkeypatch.setenv("ADO_PROJECT", "Sprint Team")
    work_items = [
        {
            "id": 10,
            "fields": {
                "System.WorkItemType": "Bug",
                "System.Title": "Corrigir TASK-123",
                "System.State": "Done",
            },
        }
    ]
    tasks = [{"id": 11, "fields": {"System.Title": "Task", "System.Parent": 10}}]
    notes = release.generate_release_notes("v1.0.0", "Sprint 1", work_items, "org/repo", tasks)
    assert "## v1.0.0" in notes
    assert "### 🚀 O que foi entregue" in notes
    assert "#### 🐛 Bugs" in notes
    assert "**#10**" in notes
    assert "https://dev.azure.com/your-org/Sprint%20Team/_workitems/edit/10" in notes
    assert "#### 🔧 Tarefas técnicas" in notes
    assert "### 📂 Repositórios" in notes
