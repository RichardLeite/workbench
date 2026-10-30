"""Geração automática de documentação (README e API)."""

from __future__ import annotations

import json
import re
import sys
from argparse import ArgumentParser, Namespace, _SubParsersAction
from pathlib import Path
from typing import Any

from workbench.config import ConfigError, load_project_mapping
from workbench.paths import workbench_root
from workbench.process import run

ROUTE_PATTERNS = [
    re.compile(r"(?:router|route)\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'\"]*)['\"]", re.I),
    re.compile(r"app\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'\"]*)['\"]", re.I),
]


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser(
        "docs", help="Geração automática de documentação."
    )
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    docs_sub = parser.add_subparsers(dest="docs_command", required=True)
    for name in ("readme", "api", "all"):
        command = docs_sub.add_parser(name, help=f"Gera documentação ({name}).")
        if name == "api":
            command.add_argument("routes", nargs="?", default=None)
        command.add_argument("--project", default=None)
        command.set_defaults(handler=_run_docs, docs_type=name)


def project_name() -> str:
    result = run(["git", "remote", "get-url", "origin"], timeout=5)
    if result.ok and result.stdout.strip():
        return result.stdout.strip().split("/")[-1].replace(".git", "")
    return Path.cwd().name


def _load_mapping(root: Path) -> dict[str, Any]:
    try:
        return load_project_mapping(root)
    except ConfigError:
        return {"projects": {}}


def resolve_api_repo(slug: str, root: Path) -> Path | None:
    mapping = _load_mapping(root)
    project = (mapping.get("projects") or {}).get(slug)
    if isinstance(project, dict):
        repos = project.get("repos")
        if isinstance(repos, dict):
            repo = repos.get("api") or repos.get("root")
            if repo:
                return (root / str(repo) / "src" / "routes").resolve()
    return None


def list_available_projects(root: Path) -> list[str]:
    return list((_load_mapping(root).get("projects") or {}).keys())


def scan_readme() -> dict[str, Any]:
    cwd = Path.cwd()
    package_path = cwd / "package.json"
    package: dict[str, Any] = {}
    if package_path.is_file():
        try:
            package = json.loads(package_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            package = {}

    scripts = list((package.get("scripts") or {}).items())[:10]
    dirs = sorted(
        path.name
        for path in cwd.iterdir()
        if (
            path.is_dir()
            and not path.name.startswith(".")
            and path.name not in {"node_modules", "tmp", "dist", "build"}
        )
    )
    dependencies = package.get("dependencies")
    stack = "\n".join(f"- {name}" for name in list(dependencies)[:15]) if dependencies else "N/A"
    script_rows = "\n".join(f"| `{key}` | `{value}` |" for key, value in scripts)
    content = (
        f"# {package.get('name') or project_name()}\n\n"
        f"{package.get('description') or ''}\n\n"
        "## Stack\n\n"
        f"{stack}\n\n"
        "## Scripts\n\n"
        "| Comando | Descrição |\n"
        "|---------|-----------|\n"
        f"{script_rows}\n\n"
        "## Estrutura\n\n" + "\n".join(f"- {name}" for name in dirs) + "\n"
    )
    return {"tipo": "readme", "arquivo": "README.md", "conteudo": content}


def scan_api(routes_path: str | None, project_slug: str | None, root: Path) -> dict[str, Any]:
    cwd = Path.cwd()
    path = Path(routes_path) if routes_path else None
    if (path is None or not path.exists()) and project_slug:
        resolved = resolve_api_repo(project_slug, root)
        if resolved and resolved.exists():
            path = resolved
    if path is None or not path.exists():
        for candidate in ("src/routes", "src/router", "routes", "src/controllers"):
            if Path(candidate).exists():
                path = Path(candidate)
                break
    if path is None or not path.exists():
        return {"tipo": "api", "arquivo": "API.md", "conteudo": "# API\n\nNo route files found."}

    path = path.resolve()
    endpoints: list[dict[str, str]] = []
    files = sorted(
        file for file in path.rglob("*") if file.is_file() and file.suffix in {".js", ".ts"}
    )
    for file in files:
        content = file.read_text(encoding="utf-8")
        for pattern in ROUTE_PATTERNS:
            for match in pattern.finditer(content):
                endpoints.append(
                    {
                        "method": match.group(1).upper(),
                        "path": match.group(2),
                        "file": file.relative_to(cwd).as_posix(),
                    }
                )

    grouped: dict[str, list[dict[str, str]]] = {}
    for endpoint in endpoints:
        domain = next((part for part in endpoint["path"].split("/") if part), "root")
        grouped.setdefault(domain, []).append(endpoint)

    content = f"# API — {project_name()}\n\n"
    for domain, items in grouped.items():
        content += f"\n## {domain[:1].upper() + domain[1:]}\n"
        content += "| Método | Rota | Arquivo |\n|--------|------|---------|\n"
        for endpoint in items:
            content += f"| {endpoint['method']} | `{endpoint['path']}` | `{endpoint['file']}` |\n"
    return {"tipo": "api", "arquivo": "API.md", "conteudo": content}


def _run_docs(args: Namespace) -> int:
    root = workbench_root()
    docs_type = args.docs_type
    project = args.project
    if project:
        available = list_available_projects(root)
        if project not in available:
            print(
                f"❌ Projeto '{project}' não encontrado em project-mapping.json. "
                f"Projetos disponíveis: {', '.join(available)}",
                file=sys.stderr,
            )
            return 1

    if docs_type == "readme":
        result: Any = scan_readme()
    elif docs_type == "api":
        result = scan_api(getattr(args, "routes", None), project, root)
    else:
        result = {
            "tipo": "all",
            "artefatos": [scan_readme(), scan_api(None, project, root)],
        }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0
