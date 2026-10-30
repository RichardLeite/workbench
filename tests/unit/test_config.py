from __future__ import annotations

import json
from pathlib import Path

import pytest

from workbench import config
from workbench.config import ConfigError


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_read_json_valid(tmp_path: Path) -> None:
    path = tmp_path / "config.json"
    write_json(path, {"ok": True})
    assert config.read_json(path) == {"ok": True}


def test_read_json_missing(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="não encontrado"):
        config.read_json(tmp_path / "missing.json")


def test_read_json_invalid(tmp_path: Path) -> None:
    path = tmp_path / "config.json"
    path.write_text("{invalid", encoding="utf-8")
    with pytest.raises(ConfigError, match="JSON inválido"):
        config.read_json(path)


def test_project_mapping_and_resolution(tmp_path: Path) -> None:
    write_json(tmp_path / "opencode.json", {"reference": {".workbench": {"path": "."}}})
    write_json(
        tmp_path / ".opencode" / "config" / "project-mapping.json",
        {"projects": {"workbench": {"name": "Workbench"}}},
    )
    mapping = config.load_project_mapping(tmp_path)
    assert config.project_slugs(mapping) == ["workbench"]
    assert config.resolve_project("workbench", tmp_path)["name"] == "Workbench"
    assert config.default_project(tmp_path) == "workbench"


def test_resolve_unknown_project(tmp_path: Path) -> None:
    write_json(
        tmp_path / ".opencode" / "config" / "project-mapping.json",
        {"projects": {}},
    )
    with pytest.raises(ConfigError, match="não registrado"):
        config.resolve_project("missing", tmp_path)
