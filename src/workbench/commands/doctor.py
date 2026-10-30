"""Comando ``wb doctor`` — diagnóstico do ambiente."""

from __future__ import annotations

import json
import platform
import sys
from argparse import ArgumentParser, Namespace, _SubParsersAction
from pathlib import Path
from typing import Any

from workbench import __version__
from workbench.config import ConfigError, load_opencode, load_project_mapping, project_slugs
from workbench.paths import workbench_root
from workbench.process import tool_version, which

MIN_PYTHON = (3, 11)


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser(
        "doctor",
        help="Verifica Python, ferramentas, configuração e adapters.",
    )
    parser.add_argument("--strict", action="store_true", help="Falha se houver warnings.")
    parser.add_argument("--json", action="store_true", help="Saída JSON no stdout.")
    parser.set_defaults(handler=run)


def _check(name: str, ok: bool, detail: str, *, required: bool) -> dict[str, Any]:
    status = "ok" if ok else ("error" if required else "warn")
    return {"name": name, "status": status, "detail": detail}


def collect(root: Path) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    python_ok = sys.version_info[:2] >= MIN_PYTHON
    checks.append(
        _check(
            "python",
            python_ok,
            f"{platform.python_version()} ({sys.executable})",
            required=True,
        )
    )

    for name, executable, args in (
        ("uv", "uv", ("--version",)),
        ("git", "git", ("--version",)),
        ("node", "node", ("--version",)),
        ("gh", "gh", ("--version",)),
    ):
        path = which(executable)
        version = tool_version(executable, *args) if path else None
        checks.append(
            _check(
                name,
                path is not None,
                version or (path or "não encontrado"),
                required=name in {"git"},
            )
        )

    config: dict[str, Any] = {}
    try:
        opencode = load_opencode(root)
        mapping = load_project_mapping(root)
        slugs = project_slugs(mapping)
        config = {
            "opencode": True,
            "project_mapping": True,
            "projects": slugs,
        }
        checks.append(
            _check(
                "config",
                True,
                f"opencode.json válido; {len(slugs)} projeto(s): {', '.join(slugs)}",
                required=True,
            )
        )
        adapters = {
            name: bool(entry.get("enabled", False))
            for name, entry in (opencode.get("mcp") or {}).items()
            if isinstance(entry, dict)
        }
        config["adapters"] = adapters
    except ConfigError as exc:
        config = {"error": str(exc)}
        checks.append(_check("config", False, str(exc), required=True))

    return {
        "name": "workbench",
        "version": __version__,
        "root": str(root),
        "platform": platform.platform(),
        "checks": checks,
        "config": config,
    }


def _print_human(report: dict[str, Any]) -> None:
    print(f"Workbench {report['version']} — {report['root']}")
    for check in report["checks"]:
        marker = {"ok": "[ OK ]", "warn": "[WARN]", "error": "[FAIL]"}[check["status"]]
        print(f"{marker} {check['name']}: {check['detail']}")
    adapters = report.get("config", {}).get("adapters")
    if isinstance(adapters, dict) and adapters:
        enabled = [name for name, active in adapters.items() if active]
        disabled = [name for name, active in adapters.items() if not active]
        print(f"[ OK ] adapters ativos: {', '.join(enabled) if enabled else '(nenhum)'}")
        print(f"[INFO] adapters desativados: {', '.join(disabled) if disabled else '(nenhum)'}")


def run(args: Namespace) -> int:
    root = workbench_root()
    report = collect(root)
    if getattr(args, "json", False):
        print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    else:
        _print_human(report)

    has_error = any(check["status"] == "error" for check in report["checks"])
    has_warn = any(check["status"] == "warn" for check in report["checks"])
    if has_error or (getattr(args, "strict", False) and has_warn):
        return 1
    return 0
