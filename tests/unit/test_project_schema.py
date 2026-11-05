from __future__ import annotations

import json
from pathlib import Path

from workbench import project_schema


def write_manifest(root: Path, slug: str, payload: dict) -> Path:
    path = root / "projects" / slug / "project.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_valid_manifest(tmp_path: Path) -> None:
    root = tmp_path
    path = write_manifest(
        root,
        "_schema_test",
        {
            "slug": "demo",
            "name": "Demo",
            "description": "Demo project",
            "process": "default",
            "license": "MIT",
            "tracker": "none",
            "agents": ["backend-dev"],
            "knowledge": "projects/demo/knowledge",
            "vault": None,
            "repos": {"api": "demo-api"},
        },
    )
    try:
        assert project_schema.validate_manifest(path, root) == []
    finally:
        path.unlink()
        path.parent.rmdir()


def test_invalid_manifest_fields(tmp_path: Path) -> None:
    path = write_manifest(
        tmp_path,
        "broken",
        {
            "slug": "Broken Slug",
            "description": 1,
            "process": "",
            "agents": ["ok", 1],
            "knowledge": "../outside",
            "repos": {"api": "../outside"},
            "unexpected": True,
        },
    )
    errors = project_schema.validate_manifest(path, tmp_path)
    assert any("name" in error for error in errors)
    assert any("slug" in error for error in errors)
    assert any("description" in error for error in errors)
    assert any("process" in error for error in errors)
    assert any("agents" in error for error in errors)
    assert any("knowledge" in error for error in errors)
    assert any("repos.api" in error for error in errors)
    assert any("desconhecidos" in error for error in errors)


def test_validate_manifests_skips_template(tmp_path: Path) -> None:
    write_manifest(tmp_path, "ok", {"name": "Ok"})
    write_manifest(tmp_path, "_template", {"name": "Template"})
    results = project_schema.validate_manifests(tmp_path)
    assert len(results) == 1
    assert results[0]["ok"] is True


def test_missing_manifest_is_an_error(tmp_path: Path) -> None:
    errors = project_schema.validate_manifest(
        tmp_path / "projects" / "missing" / "project.json",
        tmp_path,
    )
    assert any("não encontrado" in error for error in errors)
