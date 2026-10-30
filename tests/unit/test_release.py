from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from workbench.commands import release


def test_suggest_next_tag(monkeypatch) -> None:
    monkeypatch.setattr(release, "get_last_tag", lambda: None)
    assert release.suggest_next_tag("v1.2.3") == "v1.2.4"
    assert release.suggest_next_tag("v2.0.0") == "v2.0.1"
    assert release.suggest_next_tag("invalid") == "v1.0.0"
    assert release.suggest_next_tag(None) == "v1.0.0"


def test_build_notes_from_file(tmp_path: Path) -> None:
    notes_file = tmp_path / "notes.md"
    notes_file.write_text("## Notes\n\n- change", encoding="utf-8")
    assert release.build_notes("v1.0.0", None, str(notes_file)) == "## Notes\n\n- change"


def test_create_release_success(monkeypatch) -> None:
    monkeypatch.setattr(
        release,
        "run",
        lambda *args, **kwargs: SimpleNamespace(ok=True, stdout="", stderr=""),
    )
    result = release.create_release("v1.0.0", "notes", "org/repo")
    assert result["success"] is True
    assert result["url"].endswith("/releases/tag/v1.0.0")


def test_create_release_failure(monkeypatch) -> None:
    monkeypatch.setattr(
        release,
        "run",
        lambda *args, **kwargs: SimpleNamespace(ok=False, stdout="", stderr="failed"),
    )
    result = release.create_release("v1.0.0", "notes", "org/repo")
    assert result["success"] is False
    assert result["error"] == "failed"
    notes = release.workbench_root() / "tmp" / "release-notes-v1.0.0.md"
    notes.unlink(missing_ok=True)
