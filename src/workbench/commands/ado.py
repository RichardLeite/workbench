"""Funções e CLI do adapter Azure DevOps."""

from __future__ import annotations

import json
import re
from argparse import ArgumentParser, Namespace, _SubParsersAction
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote

from workbench.config import ConfigError, load_config


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser("ado", help="Funções do adapter Azure DevOps.")
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    ado_sub = parser.add_subparsers(dest="ado_command", required=True)

    resolve = ado_sub.add_parser("resolve", help="Resolve projeto, git flow e contexto ADO.")
    resolve.add_argument("--project", default=None)
    resolve.add_argument("--type", default=None)
    resolve.add_argument("--url", default=None)
    resolve.add_argument("--list", action="store_true")
    resolve.add_argument("--validate", action="store_true")
    resolve.set_defaults(handler=_run_resolve)

    parse = ado_sub.add_parser("parse", help="Normaliza AB# / URL / ID numérico.")
    parse.add_argument("text", nargs="+")
    parse.set_defaults(handler=_run_parse)

    ado_sub.add_parser("fallback", help="Lista projetos com o default primeiro.").set_defaults(
        handler=_run_fallback
    )


def load_config_file(root: Path | None = None) -> dict[str, Any]:
    return load_config("ado-context.json", root)


def default_git_flow(flow_type: str | None) -> dict[str, Any]:
    if flow_type == "hotfix":
        return {
            "command": "/git-hotfix",
            "base": "main",
            "branchPattern": "fix/TASK-XXXX",
            "branchPatternRelease": "fix/TASK-XXXX-release",
            "prCount": 2,
        }
    return {
        "command": "/git-sprint",
        "base": "release",
        "branchPattern": "feat/TASK-XXXX",
        "prCount": 1,
    }


def _build_project(config: dict[str, Any], project_name: str) -> dict[str, Any]:
    entry = config.get("projects", {}).get(project_name)
    if not isinstance(entry, dict):
        raise ConfigError(f'Projeto "{project_name}" não encontrado em ado-context.json')
    organization = config.get("organization", "")
    encoded_project = quote(project_name, safe="-_.!~*'()")
    board_url = entry.get("boardUrl") or (f"https://dev.azure.com/{organization}/{encoded_project}")
    return {
        "project": project_name,
        "organization": organization,
        "team": entry.get("team"),
        "projectId": entry.get("projectId"),
        "type": entry.get("type"),
        "boardUrl": board_url,
        "gitFlow": entry.get("gitFlow") or default_git_flow(entry.get("type")),
    }


def resolve_project(options: dict[str, Any], root: Path | None = None) -> Any:
    config = load_config_file(root)
    projects = config.get("projects", {})

    if options.get("list"):
        return [
            {
                "project": name,
                "type": entry.get("type"),
                "team": entry.get("team"),
                "gitFlow": (entry.get("gitFlow") or default_git_flow(entry.get("type"))).get(
                    "command"
                ),
            }
            for name, entry in projects.items()
        ]

    if options.get("validate"):
        errors: list[str] = []
        if not config.get("organization"):
            errors.append("organization ausente")
        if not projects:
            errors.append("projects vazio")
        for name, entry in projects.items():
            if not entry.get("type"):
                errors.append(f"{name}: type ausente")
            if not entry.get("team"):
                errors.append(f"{name}: team ausente")
            if not entry.get("projectId"):
                errors.append(f"{name}: projectId ausente")
            if entry.get("type") and entry.get("type") not in {"sprint", "hotfix"}:
                errors.append(f'{name}: type inválido ("{entry.get("type")}")')
        if errors:
            raise ConfigError("Config inválido:\n  " + "\n  ".join(errors))
        return {"valid": True, "projects": len(projects)}

    if options.get("type"):
        for name, entry in projects.items():
            if entry.get("type") == options["type"]:
                return _build_project(config, name)
        raise ConfigError(f'Nenhum projeto do tipo "{options["type"]}" encontrado')

    if options.get("url"):
        match = re.search(r"dev\.azure\.com/[^/]+/([^/?]+)", options["url"])
        if not match:
            raise ConfigError(f"URL inválida: {options['url']}")
        return _build_project(config, unquote(match.group(1)))

    project_name = options.get("project") or config.get("defaultProject") or next(iter(projects))
    return _build_project(config, project_name)


def parse_ab_reference(value: str) -> dict[str, Any]:
    if not isinstance(value, str) or not value.strip():
        return {"id": None, "raw": value or "", "format": "INVALID", "error": "Input vazio"}
    trimmed = value.strip()

    url_match = re.search(
        r"dev\.azure\.com/[^/]+/([^/?]+)/.*?(?:edit|workitem)(?:/|%2F)(\d+)",
        trimmed,
        re.I,
    )
    if url_match:
        return {
            "id": int(url_match.group(2)),
            "project": unquote(url_match.group(1)),
            "raw": trimmed,
            "format": "FULL_URL",
        }

    ab_hash = re.search(r"AB#(\d+)", trimmed, re.I)
    if ab_hash:
        return {"id": int(ab_hash.group(1)), "raw": trimmed, "format": "AB_HASH"}

    hash_only = re.fullmatch(r"#(\d+)", trimmed)
    if hash_only:
        return {"id": int(hash_only.group(1)), "raw": trimmed, "format": "HASH_ONLY"}

    numeric = re.fullmatch(r"(\d+)", trimmed)
    if numeric:
        return {"id": int(numeric.group(1)), "raw": trimmed, "format": "NUMERIC"}

    return {
        "id": None,
        "raw": trimmed,
        "format": "INVALID",
        "error": f'Unable to extract numeric ID from "{trimmed}"',
    }


def get_fallback_projects(root: Path | None = None) -> dict[str, Any]:
    config = load_config_file(root)
    projects = config.get("projects", {})
    default_project = config.get("defaultProject") or next(iter(projects))
    entries = [
        {
            "project": name,
            "team": entry.get("team"),
            "projectId": entry.get("projectId"),
            "type": entry.get("type"),
        }
        for name, entry in projects.items()
    ]
    sorted_entries = [entry for entry in entries if entry["project"] == default_project]
    sorted_entries += [entry for entry in entries if entry["project"] != default_project]
    return {"defaultProject": default_project, "projects": sorted_entries}


def _print_json(payload: Any) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def _run_resolve(args: Namespace) -> int:
    options = {
        "project": args.project,
        "type": args.type,
        "url": args.url,
        "list": args.list,
        "validate": args.validate,
    }
    _print_json(resolve_project(options))
    return 0


def _run_parse(args: Namespace) -> int:
    _print_json(parse_ab_reference(" ".join(args.text)))
    return 0


def _run_fallback(args: Namespace) -> int:
    _print_json(get_fallback_projects())
    return 0
