from __future__ import annotations

from workbench.commands import hotfix


def test_validate_hotfix_branch() -> None:
    assert hotfix.validate_hotfix_branch("fix/TASK-1234")["valid"] is True
    assert hotfix.validate_hotfix_branch("feat/TASK-1234")["valid"] is False


def test_validate_release_branch() -> None:
    assert hotfix.validate_release_branch("fix/TASK-1234-release")["valid"] is True
    assert hotfix.validate_release_branch("fix/TASK-1234")["valid"] is False


def test_validate_cherry_pick() -> None:
    result = hotfix.validate_cherry_pick_flow(["a", "b"], ["a", "b"])
    assert result["valid"] is True
    result = hotfix.validate_cherry_pick_flow(["a", "b"], ["a"])
    assert result["valid"] is False
    assert result["matchCount"] == 1


def test_validate_pr_count() -> None:
    assert hotfix.validate_pr_count(2)["valid"] is True
    assert hotfix.validate_pr_count(1)["valid"] is False


def test_gate_and_pr_config() -> None:
    gate = hotfix.get_gate_decision()
    assert "blocking" in gate
    pr_config = hotfix.get_pr_config()
    assert pr_config["prCount"] == 2
    assert pr_config["targets"] == ["main", "release"]
