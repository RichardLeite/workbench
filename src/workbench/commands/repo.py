"""Resolução de disponibilidade de repositórios locais."""

from __future__ import annotations

import json
import os
from argparse import ArgumentParser, Namespace, _SubParsersAction
from pathlib import Path
from typing import Any

from workbench.config import ConfigError
from workbench.errors import WorkbenchError
from workbench.paths import workbench_root

DEFAULT_MAPPING = Path(".opencode") / "config" / "project-mapping.json"


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser(
        "repo",
        help="Resolve repositórios e seus estados locais.",
    )
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    repo_sub = parser.add_subparsers(dest="repo_command", required=True)
    resolve = repo_sub.add_parser("resolve", help="Resolve um projeto ou todos os repositórios.")
    resolve.add_argument("--project", default=None)
    resolve.add_argument("--repo", default=None)
    resolve.add_argument("--mapping", default=None)
    resolve.add_argument("--root", default=None)
    resolve.set_defaults(handler=_run_resolve)


def _load_mapping(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise ConfigError(f"Project mapping not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ConfigError(f"Invalid project mapping JSON at {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ConfigError(f"Invalid project mapping JSON at {path}")
    return data


def _has_git_marker(path: Path) -> bool:
    marker = path / ".git"
    return marker.is_dir() or marker.is_file()


def _inside_root(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def _find_existing_ancestor(path: Path) -> Path | None:
    current = path
    while not current.exists():
        parent = current.parent
        if parent == current:
            return None
        current = parent
    return current


def _resolve_safe_repository_path(catalog_path: str, root: Path) -> Path:
    if not isinstance(catalog_path, str) or os.path.isabs(catalog_path):
        raise WorkbenchError(
            f"Unsafe repository path: catalog path must be relative ({catalog_path})"
        )
    repository_path = (root / catalog_path).resolve()
    if not _inside_root(repository_path, root):
        raise WorkbenchError(f"Unsafe repository path escapes workbench root: {catalog_path}")

    existing = _find_existing_ancestor(repository_path)
    real_root = root.resolve()
    if existing:
        real_existing = existing.resolve()
        if not _inside_root(real_existing, real_root):
            raise WorkbenchError(
                f"Unsafe repository path escapes workbench root through symlink: {catalog_path}"
            )
    return repository_path


def _find_owning_checkout(repository_path: Path, catalog_path: str, root: Path) -> Path | None:
    first_segment = next((part for part in catalog_path.replace("\\", "/").split("/") if part), "")
    boundary = (root / first_segment).resolve()
    current = repository_path
    while current == boundary or _inside_root(current, boundary):
        if _has_git_marker(current):
            return current
        if current == boundary:
            break
        current = current.parent
    return None


def _resolve_repository(
    project_slug: str,
    repo_role: str,
    mapping: dict[str, Any],
    root: Path,
) -> dict[str, Any]:
    projects = mapping.get("projects")
    if not isinstance(projects, dict) or project_slug not in projects:
        raise WorkbenchError(f"Unknown project: {project_slug}")
    project = projects[project_slug]
    repos = project.get("repos") if isinstance(project, dict) else None

    catalog_path = repos.get(repo_role) if isinstance(repos, dict) else None
    if project_slug == "workbench" and not repos and repo_role == "root":
        catalog_path = "."
    if not catalog_path:
        raise WorkbenchError(f'Unknown repository role "{repo_role}" for project "{project_slug}"')

    repository_path = _resolve_safe_repository_path(catalog_path, root)
    status = "missing"
    git_root: Path | None = None
    if repository_path.exists():
        if repository_path.is_dir():
            if catalog_path == ".":
                git_root = repository_path if _has_git_marker(repository_path) else None
            else:
                git_root = _find_owning_checkout(repository_path, catalog_path, root)
            status = "available" if git_root else "invalid_git"

    return {
        "project": project_slug,
        "role": repo_role,
        "catalogPath": catalog_path,
        "path": str(repository_path),
        "status": status,
        "gitRoot": str(git_root) if git_root else None,
    }


def _aggregate_status(repositories: list[dict[str, Any]]) -> str:
    statuses = [repository["status"] for repository in repositories]
    if statuses and all(status == "available" for status in statuses):
        return "complete"
    if any(status == "available" for status in statuses):
        return "partial"
    if any(status == "invalid_git" for status in statuses):
        return "invalid"
    return "absent"


def _resolve_project(slug: str, mapping: dict[str, Any], root: Path) -> dict[str, Any]:
    projects = mapping.get("projects")
    if not isinstance(projects, dict) or slug not in projects:
        raise WorkbenchError(f"Unknown project: {slug}")
    repos = projects[slug].get("repos") if isinstance(projects[slug], dict) else None
    roles = list(repos) if isinstance(repos, dict) else []
    if slug == "workbench" and not roles:
        roles = ["root"]
    repositories = [_resolve_repository(slug, role, mapping, root) for role in roles]
    return {
        "project": slug,
        "status": _aggregate_status(repositories),
        "repositories": repositories,
    }


def _run_resolve(args: Namespace) -> int:
    root = Path(args.root).resolve() if args.root else workbench_root()
    mapping_path = Path(args.mapping) if args.mapping else root / DEFAULT_MAPPING
    mapping = _load_mapping(mapping_path)

    if args.repo and not args.project:
        raise WorkbenchError("--repo requires --project")
    if args.project and args.repo:
        result: Any = _resolve_repository(args.project, args.repo, mapping, root)
    elif args.project:
        result = _resolve_project(args.project, mapping, root)
    else:
        projects = mapping.get("projects")
        if not isinstance(projects, dict):
            raise WorkbenchError("Invalid project mapping: missing projects")
        result = [_resolve_project(slug, mapping, root) for slug in projects]

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0
