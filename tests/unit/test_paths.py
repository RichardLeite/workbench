from __future__ import annotations

from pathlib import Path

from workbench import paths


def test_workbench_root_uses_env(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("WB_ROOT", str(tmp_path))
    assert paths.workbench_root() == tmp_path.resolve()


def test_workbench_root_discovers_opencode_json(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.delenv("WB_ROOT", raising=False)
    (tmp_path / "opencode.json").write_text("{}", encoding="utf-8")
    nested = tmp_path / "a" / "b"
    nested.mkdir(parents=True)
    assert paths.workbench_root(nested) == tmp_path.resolve()


def test_resolve_root_path() -> None:
    root = Path("/tmp/workbench")
    assert (
        paths.resolve_root_path(".opencode", "config", root=root) == root / ".opencode" / "config"
    )
