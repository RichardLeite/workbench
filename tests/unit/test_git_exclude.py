from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from workbench import git_exclude
from workbench.config import ConfigError


def init_git(root: Path) -> Path:
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    return root / ".git" / "info" / "exclude"


def make_repo(root: Path, name: str) -> None:
    (root / name / ".git").mkdir(parents=True)


def test_render_exclude_preserves_unmanaged_lines() -> None:
    existing = "# custom\n*.log\n"
    rendered = git_exclude.render_exclude(existing, ["api", "web"])
    assert "# custom" in rendered
    assert "*.log" in rendered
    assert git_exclude.BEGIN_MARKER in rendered
    assert "/api/" in rendered
    assert "/web/" in rendered
    assert git_exclude.END_MARKER in rendered


def test_apply_exclude_is_idempotent(tmp_path: Path) -> None:
    exclude = init_git(tmp_path)
    exclude.write_text("# custom\n", encoding="utf-8")
    make_repo(tmp_path, "api")

    first = git_exclude.apply_exclude(tmp_path, git_exclude.discovered_entries(tmp_path))
    assert first["added"] == ["api"]
    assert first["changed"] is True
    content = exclude.read_text(encoding="utf-8")
    assert "/api/" in content
    assert "# custom" in content

    second = git_exclude.apply_exclude(tmp_path, ["api"])
    assert second["changed"] is False
    assert second["added"] == []


def test_apply_exclude_removes_stale_entries(tmp_path: Path) -> None:
    exclude = init_git(tmp_path)
    exclude.write_text("# custom\n", encoding="utf-8")
    git_exclude.apply_exclude(tmp_path, ["api"])
    git_exclude.apply_exclude(tmp_path, [])
    content = exclude.read_text(encoding="utf-8")
    assert git_exclude.BEGIN_MARKER not in content
    assert git_exclude.END_MARKER not in content
    assert "# custom" in content


def test_apply_exclude_dry_run_does_not_write(tmp_path: Path) -> None:
    exclude = init_git(tmp_path)
    exclude.write_text("# custom\n", encoding="utf-8")
    before = exclude.read_text(encoding="utf-8")
    result = git_exclude.apply_exclude(tmp_path, ["api"], dry_run=True)
    assert result["dryRun"] is True
    assert result["changed"] is True
    assert exclude.read_text(encoding="utf-8") == before


def test_exclude_requires_git_repository(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="exclude"):
        git_exclude.exclude_path(tmp_path)
