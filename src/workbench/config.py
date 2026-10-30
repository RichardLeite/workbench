"""Leitura e validação de configurações JSON do Workbench."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from workbench.errors import WorkbenchError
from workbench.paths import config_dir, resolve_root_path

OPENCODE_FILE = "opencode.json"
PROJECT_MAPPING_FILE = "project-mapping.json"
PROJECT_OVERLAY_FILE = "project-mapping.local.json"


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


def _merge_projects(
    base: dict[str, Any],
    overlay: dict[str, Any],
) -> dict[str, Any]:
    projects = dict(base.get("projects") or {})
    discovered = overlay.get("projects")
    if not isinstance(discovered, dict):
        return projects
    for slug, item in discovered.items():
        if not isinstance(item, dict):
            continue
        explicit = projects.get(slug)
        if not isinstance(explicit, dict):
            projects[slug] = item
            continue
        merged = dict(item)
        merged.update(explicit)
        explicit_repos = explicit.get("repos")
        if isinstance(explicit_repos, dict) and explicit_repos:
            merged["repos"] = explicit_repos
        else:
            merged["repos"] = dict(item.get("repos") or {})
        projects[slug] = merged
    return projects


def load_project_mapping(root: Path | None = None) -> dict[str, Any]:
    base = read_json(config_dir(root) / PROJECT_MAPPING_FILE)
    overlay_path = config_dir(root) / PROJECT_OVERLAY_FILE
    if not overlay_path.is_file():
        return base
    overlay = read_json(overlay_path)
    result = dict(base)
    result["projects"] = _merge_projects(base, overlay)
    return result


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
