"""Busca textual nos vaults de conhecimento (RAG simplificado)."""

from __future__ import annotations

import json
import re
import sys
from argparse import ArgumentParser, Namespace, _SubParsersAction
from pathlib import Path
from typing import Any

from workbench.config import ConfigError, load_project_mapping
from workbench.paths import workbench_root


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser(
        "knowledge", help="Busca no vault de conhecimento."
    )
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    knowledge_sub = parser.add_subparsers(dest="knowledge_command", required=True)
    search = knowledge_sub.add_parser("search", help="Busca termos no vault.")
    search.add_argument("terms")
    search.add_argument("--limit", "-l", type=int, default=5)
    search.add_argument("--project", "-p", default=None)
    search.set_defaults(handler=_run_search)


def walk_dir(directory: Path) -> list[Path]:
    if not directory.exists():
        return []
    results: list[Path] = []
    for path in sorted(directory.rglob("*")):
        if ".obsidian" in path.parts:
            continue
        if path.is_file() and path.suffix == ".md":
            results.append(path)
    return results


def parse_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    if not content.startswith("---"):
        return {}, content
    end = content.find("---", 3)
    if end == -1:
        return {}, content
    yaml_block = content[3:end].strip()
    body = content[end + 3 :].lstrip()
    frontmatter: dict[str, Any] = {}
    for line in yaml_block.split("\n"):
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        colon = trimmed.find(":")
        if colon == -1:
            continue
        key = trimmed[:colon].strip()
        value: Any = trimmed[colon + 1 :].strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1]
            value = [item.strip().strip("\"'") for item in inner.split(",")]
        frontmatter[key] = value
    return frontmatter, body


def extract_snippet(body: str, lower_term: str) -> str:
    for paragraph in re.split(r"\n\s*\n", body):
        if lower_term in paragraph.lower():
            clean = re.sub(r"\s+", " ", paragraph).strip()
            return clean[:200] + "..." if len(clean) > 200 else clean
    return ""


def score_file(path: Path, terms: list[str], vault_root: Path) -> dict[str, Any] | None:
    try:
        content = path.read_text(encoding="utf-8")
    except OSError:
        return None
    frontmatter, body = parse_frontmatter(content)
    relative = path.relative_to(vault_root).as_posix()
    title = str(frontmatter.get("title") or path.stem)
    score = 0
    matched: list[str] = []
    snippets: list[str] = []

    def add_match(field: str) -> None:
        if field not in matched:
            matched.append(field)

    for term in terms:
        lower = term.lower()
        content_match = False
        for key, value in frontmatter.items():
            values = value if isinstance(value, list) else [str(value)]
            for item in values:
                if lower in str(item).lower():
                    score += 3
                    add_match(key)
        if lower in title.lower():
            score += 2
            add_match("title")
        if lower in body.lower():
            score += 1
            content_match = True
            add_match("content")
        if content_match:
            snippet = extract_snippet(body, lower)
            if snippet and snippet not in snippets:
                snippets.append(snippet)

    if score == 0:
        return None
    return {
        "file": relative,
        "title": title,
        "score": score,
        "snippet": " ... ".join(snippets),
        "matchedFields": matched,
    }


def _mapping(root: Path) -> dict[str, Any]:
    try:
        return load_project_mapping(root)
    except ConfigError:
        return {"projects": {}}


def resolve_vault_root(project: str, root: Path | None = None) -> Path | None:
    base = root or workbench_root()
    mapping = _mapping(base)
    config = (mapping.get("projects") or {}).get(project)
    if isinstance(config, dict) and config.get("vault"):
        vault = (base / str(config["vault"])).resolve()
        return vault if vault.exists() else None
    return None


def resolve_all_vault_roots(root: Path | None = None) -> list[tuple[str, Path]]:
    base = root or workbench_root()
    mapping = _mapping(base)
    roots: list[tuple[str, Path]] = []
    for name, config in (mapping.get("projects") or {}).items():
        if isinstance(config, dict) and config.get("vault"):
            vault = (base / str(config["vault"])).resolve()
            if vault.exists():
                roots.append((name, vault))
    return roots


def _log_start(project: str | None, vaults: list[Any], terms: list[str]) -> None:
    entry = {
        "event": "search.start",
        "project": project or "*",
        "vaults": len(vaults),
        "terms": terms,
    }
    print(json.dumps(entry, ensure_ascii=False, separators=(",", ":")), file=sys.stderr)


def search(
    terms: str,
    limit: int = 5,
    project: str | None = None,
    root: Path | None = None,
) -> int:
    base = root or workbench_root()
    tokens = [token for token in re.split(r"\s+", terms) if token]
    results: list[dict[str, Any]] = []

    if project:
        vault = resolve_vault_root(project, base)
        if vault is None:
            print(
                json.dumps(
                    {
                        "event": "error",
                        "message": (
                            f"Vault not found for project '{project}'. Check project-mapping.json."
                        ),
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
                file=sys.stderr,
            )
            return 1
        _log_start(project, [vault], tokens)
        for path in walk_dir(vault):
            result = score_file(path, tokens, vault)
            if result:
                results.append(result)
    else:
        vaults = resolve_all_vault_roots(base)
        _log_start(None, vaults, tokens)
        for name, vault in vaults:
            for path in walk_dir(vault):
                result = score_file(path, tokens, vault)
                if result:
                    result["file"] = f"[{name}] {result['file']}"
                    results.append(result)

    results.sort(key=lambda item: item["score"], reverse=True)
    print(json.dumps(results[:limit], ensure_ascii=False, indent=2))
    return 0


def _run_search(args: Namespace) -> int:
    if args.terms.startswith("-"):
        print(
            'Usage: wb knowledge search "<search terms>" [--limit N] [--project <name>]',
            file=sys.stderr,
        )
        return 1
    return search(args.terms, limit=max(args.limit, 1), project=args.project)
