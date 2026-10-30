from __future__ import annotations

import json
from pathlib import Path

import pytest

from workbench import discovery
from workbench.commands import repo
from workbench.errors import WorkbenchError


def write_mapping(root: Path, projects: dict) -> Path:
    path = root / ".opencode" / "config" / "project-mapping.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"projects": projects}), encoding="utf-8")
    return path


def test_resolve_project_available(tmp_path: Path) -> None:
    (tmp_path / "sample-api" / ".git").mkdir(parents=True)
    path = write_mapping(
        tmp_path,
        {
            "sample": {
                "repos": {"api": "sample-api"},
                "knowledge": None,
                "agents": [],
                "vault": None,
            }
        },
    )
    mapping = repo._load_mapping(path)
    result = repo._resolve_project("sample", mapping, tmp_path)
    assert result["status"] == "complete"
    assert result["repositories"][0]["status"] == "available"
    assert result["repositories"][0]["gitRoot"] == str(tmp_path / "sample-api")


def test_resolve_project_missing(tmp_path: Path) -> None:
    path = write_mapping(
        tmp_path,
        {"sample": {"repos": {"api": "missing-api"}}},
    )
    mapping = repo._load_mapping(path)
    result = repo._resolve_project("sample", mapping, tmp_path)
    assert result["status"] == "absent"
    assert result["repositories"][0]["status"] == "missing"


def test_resolve_unknown_project(tmp_path: Path) -> None:
    path = write_mapping(tmp_path, {})
    mapping = repo._load_mapping(path)
    with pytest.raises(WorkbenchError, match="Unknown project"):
        repo._resolve_project("missing", mapping, tmp_path)


def test_resolve_uses_discovered_overlay(tmp_path: Path, capsys) -> None:
    (tmp_path / "api" / ".git").mkdir(parents=True)
    write_mapping(tmp_path, {})
    discovery.sync_projects(tmp_path)
    args = repo.Namespace(project="api", repo=None, mapping=None, root=str(tmp_path), json=True)
    assert repo._run_resolve(args) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["status"] == "complete"
