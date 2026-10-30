"""Leitura e validação de configurações JSON do Workbench."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from workbench.errors import WorkbenchError
from workbench.paths import config_dir, resolve_root_path

OPENCODE_FILE = "opencode.json"
PROJECT_MAPPING_FILE = "project-mapping.json"


class ConfigError(WorkbenchError):
    """Configuração ausente, ilegível ou inválida."""


def read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise ConfigError(f"Arquivo de configuração não encontrado: {path}")
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except json.JSONDecodeError as exc:
        raise ConfigError(f"JSON inválido em {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ConfigError(f"Configuração deve ser um objeto JSON: {path}")
    return data


def load_opencode(root: Path | None = None) -> dict[str, Any]:
    return read_json(resolve_root_path(OPENCODE_FILE, root=root))


def load_project_mapping(root: Path | None = None) -> dict[str, Any]:
    return read_json(config_dir(root) / PROJECT_MAPPING_FILE)


def load_config(name: str, root: Path | None = None) -> dict[str, Any]:
    return read_json(config_dir(root) / name)


def project_slugs(mapping: dict[str, Any]) -> list[str]:
    projects = mapping.get("projects")
    if not isinstance(projects, dict):
        raise ConfigError("project-mapping.json não contém 'projects'")
    return sorted(projects)


def resolve_project(slug: str, root: Path | None = None) -> dict[str, Any]:
    mapping = load_project_mapping(root)
    projects = mapping.get("projects")
    if not isinstance(projects, dict):
        raise ConfigError("project-mapping.json não contém 'projects'")
    project = projects.get(slug)
    if not isinstance(project, dict):
        raise ConfigError(f"Projeto não registrado em project-mapping.json: {slug}")
    return project


def default_project(root: Path | None = None) -> str:
    opencode = load_opencode(root)
    reference = opencode.get("reference")
    if isinstance(reference, dict) and ".workbench" in reference:
        return "workbench"
    mapping = load_project_mapping(root)
    projects = mapping.get("projects")
    if isinstance(projects, dict) and projects:
        return sorted(projects)[0]
    return "workbench"
