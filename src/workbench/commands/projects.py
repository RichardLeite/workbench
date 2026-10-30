"""Comandos de descoberta e catálogo de projetos."""

from __future__ import annotations

import json
from argparse import ArgumentParser, Namespace, _SubParsersAction
from pathlib import Path
from typing import Any

from workbench.config import ConfigError, load_project_mapping
from workbench.discovery import discover_projects, sync_projects
from workbench.paths import workbench_root


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser(
        "projects",
        help="Descobre e lista projetos disponíveis.",
    )
    parser.add_argument("--json", action="store_true", help="Saída JSON no stdout.")
    projects_sub = parser.add_subparsers(dest="projects_command", required=True)

    scan = projects_sub.add_parser("scan", help="Descobre projetos sem gravar arquivos.")
    scan.add_argument("--root", default=None)
    scan.add_argument("--json", action="store_true", help="Saída JSON no stdout.")
    scan.set_defaults(handler=_run_scan)

    sync = projects_sub.add_parser("sync", help="Gera o catálogo local de projetos.")
    sync.add_argument("--root", default=None)
    sync.add_argument("--quiet", action="store_true")
    sync.add_argument("--json", action="store_true", help="Saída JSON no stdout.")
    sync.set_defaults(handler=_run_sync)

    list_command = projects_sub.add_parser("list", help="Lista o catálogo mesclado.")
    list_command.add_argument("--root", default=None)
    list_command.add_argument("--json", action="store_true", help="Saída JSON no stdout.")
    list_command.set_defaults(handler=_run_list)


def _root(value: str | None) -> Path:
    return Path(value).resolve() if value else workbench_root()


def _run_scan(args: Namespace) -> int:
    result = discover_projects(_root(args.root))
    payload = {
        "root": str(result.root),
        "roots": result.roots,
        "projects": result.projects,
        "warnings": result.warnings,
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    print(f"Projetos descobertos: {len(result.projects)}")
    for slug, project in result.projects.items():
        repos = project.get("repos") or {}
        repo_list = ", ".join(f"{role}={path}" for role, path in repos.items()) or "sem repos"
        print(f"- {slug}: {project.get('name') or slug} ({repo_list})")
    for warning in result.warnings:
        print(f"aviso: {warning}")
    return 0


def _run_sync(args: Namespace) -> int:
    root = _root(args.root)
    path = sync_projects(root)
    try:
        mapping = load_project_mapping(root)
    except ConfigError:
        mapping = {"projects": {}}
    projects = mapping.get("projects") or {}
    payload = {
        "path": str(path),
        "projects": len(projects),
        "warnings": [],
    }
    if path.is_file():
        try:
            overlay = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            overlay = {}
        if isinstance(overlay, dict):
            payload["warnings"] = overlay.get("warnings") or []
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    elif not args.quiet:
        print(f"Catálogo atualizado: {path}")
        print(f"Projetos: {len(projects)}")
        for warning in payload["warnings"]:
            print(f"aviso: {warning}")
    return 0


def _run_list(args: Namespace) -> int:
    root = _root(args.root)
    mapping = load_project_mapping(root)
    projects = mapping.get("projects") or {}
    items = [
        {
            "slug": slug,
            "name": project.get("name") if isinstance(project, dict) else None,
            "description": project.get("description") if isinstance(project, dict) else None,
            "repos": project.get("repos") if isinstance(project, dict) else {},
            "knowledge": project.get("knowledge") if isinstance(project, dict) else None,
            "vault": project.get("vault") if isinstance(project, dict) else None,
            "agents": project.get("agents") if isinstance(project, dict) else [],
            "process": project.get("process") if isinstance(project, dict) else None,
            "license": project.get("license") if isinstance(project, dict) else None,
            "tracker": project.get("tracker") if isinstance(project, dict) else None,
        }
        for slug, project in sorted(projects.items())
    ]
    if args.json:
        print(json.dumps(items, ensure_ascii=False, indent=2))
        return 0

    for item in items:
        repos: Any = item["repos"] or {}
        repo_list = ", ".join(f"{role}={path}" for role, path in repos.items()) or "sem repos"
        print(f"- {item['slug']}: {item['name'] or item['slug']} ({repo_list})")
    return 0
