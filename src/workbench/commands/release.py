"""Criação de GitHub Release a partir de uma tag."""

from __future__ import annotations

import json
import os
import re
import sys
from argparse import ArgumentParser, Namespace, _SubParsersAction
from pathlib import Path
from typing import Any

from workbench.errors import MissingDependencyError
from workbench.paths import workbench_root
from workbench.process import run


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser(
        "release",
        help="Cria GitHub Release a partir de uma tag.",
        description="Cria uma GitHub Release a partir de uma tag existente ou sugerida.",
    )
    parser.add_argument("--tag", default=None, help="Tag da release (ex: v1.2.3).")
    parser.add_argument("--repo", default=None, help="Repositório GitHub (owner/repo).")
    parser.add_argument("--notes-file", default=None, help="Arquivo com as notas.")
    parser.add_argument(
        "--generate-notes",
        action="store_true",
        help="Usar notas geradas pelo GitHub.",
    )
    parser.add_argument("--target", default=None, help="Branch/commit alvo da tag.")
    parser.add_argument("--draft", action="store_true", help="Criar como draft.")
    parser.add_argument("--prerelease", action="store_true", help="Marcar como prerelease.")
    parser.add_argument("--preview", action="store_true", help="Apenas mostrar as notas.")
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    parser.set_defaults(handler=_run_release)


def get_current_repo() -> str | None:
    result = run(["git", "remote", "get-url", "origin"], timeout=5)
    if not result.ok or not result.stdout.strip():
        return None
    match = re.search(r"github\.com[/:]([\w-]+/[\w-]+?)(?:\.git)?$", result.stdout.strip())
    return match.group(1) if match else None


def get_last_tag() -> str | None:
    result = run(["git", "describe", "--tags", "--abbrev=0"], timeout=5)
    return result.stdout.strip() if result.ok and result.stdout.strip() else None


def suggest_next_tag(last_tag: str | None = None) -> str:
    last_tag = last_tag if last_tag is not None else get_last_tag()
    if not last_tag:
        return "v1.0.0"
    parts = last_tag.lstrip("v").split(".")
    try:
        major, minor, patch = (int(part) for part in (parts + ["0", "0"])[:3])
    except ValueError:
        return "v1.0.0"
    return f"v{major}.{minor}.{patch + 1}"


def get_commits_since_tag(tag: str | None) -> list[str]:
    args = ["git", "log", "--oneline", "--no-merges"]
    args.append(f"{tag}..HEAD" if tag else "-20")
    result = run(args, timeout=10)
    if not result.ok or not result.stdout.strip():
        return []
    lines = []
    for line in result.stdout.splitlines():
        match = re.match(r"^[a-f0-9]+\s+(.+)$", line)
        lines.append(match.group(1) if match else line)
    return lines


def build_notes(tag: str, previous_tag: str | None = None, notes_file: str | None = None) -> str:
    if notes_file:
        path = Path(notes_file)
        if not path.is_file():
            raise FileNotFoundError(f"Arquivo de notas não encontrado: {notes_file}")
        return path.read_text(encoding="utf-8")
    commits = get_commits_since_tag(previous_tag)
    lines = [f"# {tag}", ""]
    if previous_tag:
        lines.append(f"Alterações desde `{previous_tag}`:")
        lines.append("")
    if not commits:
        lines.append("- Nenhuma alteração encontrada.")
    else:
        lines.extend(f"- {commit}" for commit in commits)
    lines.append("")
    return "\n".join(lines)


def create_release(
    tag: str,
    notes: str,
    repo: str | None,
    *,
    generate_notes: bool = False,
    target: str | None = None,
    draft: bool = False,
    prerelease: bool = False,
) -> dict[str, Any]:
    args = ["gh", "release", "create", tag]
    if repo:
        args.extend(["--repo", repo])
    args.extend(["--title", tag])
    if generate_notes:
        args.append("--generate-notes")
    else:
        notes_file = workbench_root() / "tmp" / f"release-notes-{tag}.md"
        notes_file.parent.mkdir(parents=True, exist_ok=True)
        notes_file.write_text(notes, encoding="utf-8")
        args.extend(["--notes-file", str(notes_file)])
    if target:
        args.extend(["--target", target])
    if draft:
        args.append("--draft")
    if prerelease:
        args.append("--prerelease")

    env = {**os.environ, "GITHUB_TOKEN": ""}
    try:
        result = run(args, cwd=os.getcwd(), timeout=120, env=env)
    except MissingDependencyError as exc:
        return {"success": False, "error": str(exc)}
    if not result.ok:
        return {
            "success": False,
            "error": result.stderr.strip() or result.stdout.strip(),
            "notes": notes,
        }
    if not generate_notes:
        notes_file = workbench_root() / "tmp" / f"release-notes-{tag}.md"
        notes_file.unlink(missing_ok=True)
    return {
        "success": True,
        "url": f"https://github.com/{repo or '(repo)'}/releases/tag/{tag}",
    }


def _run_release(args: Namespace) -> int:
    repo = args.repo or get_current_repo()
    previous_tag = get_last_tag()
    tag = args.tag or suggest_next_tag(previous_tag)
    if not args.tag:
        print(f"ℹ️ Tag não especificada. Usando: {tag}", file=sys.stderr)

    if not args.generate_notes:
        try:
            notes = build_notes(tag, previous_tag, args.notes_file)
        except FileNotFoundError as exc:
            print(f"ERRO: {exc}", file=sys.stderr)
            return 1
    else:
        notes = ""

    if args.preview:
        print(
            json.dumps(
                {
                    "action": "preview",
                    "tag": tag,
                    "repo": repo,
                    "previousTag": previous_tag,
                    "notes": notes,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    result = create_release(
        tag,
        notes,
        repo,
        generate_notes=args.generate_notes,
        target=args.target,
        draft=args.draft,
        prerelease=args.prerelease,
    )
    if not result["success"]:
        print(f"❌ Erro ao criar release: {result['error']}", file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "action": "created",
                "tag": tag,
                "repo": repo,
                "url": result["url"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0
