"""Criação de issues (tech debt)."""

from __future__ import annotations

import sys
from argparse import ArgumentParser, Namespace, _SubParsersAction

from workbench.errors import MissingDependencyError
from workbench.process import run


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser("issue", help="Criação de issues.")
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    issue_sub = parser.add_subparsers(dest="issue_command", required=True)
    tech = issue_sub.add_parser("tech-debt", help="Abre issue de dívida técnica no repositório.")
    tech.add_argument("repo")
    tech.add_argument("title")
    tech.add_argument("body", nargs="?", default="")
    tech.add_argument("--owner", default=None)
    tech.set_defaults(handler=_run_tech_debt)


def _run_tech_debt(args: Namespace) -> int:
    owner = args.owner or ""
    if not owner:
        print("Erro: defina GITHUB_OWNER no .env ou use --owner <org>.", file=sys.stderr)
        return 1

    body = args.body
    issue_body = (
        f"{body}\n\n---\n> Issue aberta automaticamente por agente de IA via tech-debt.md"
        if body
        else "> Issue aberta automaticamente por agente de IA via tech-debt.md"
    )

    try:
        result = run(
            [
                "gh",
                "issue",
                "create",
                "--repo",
                f"{owner}/{args.repo}",
                "--title",
                args.title,
                "--label",
                "tech-debt",
                "--body",
                issue_body,
            ],
            timeout=15,
        )
    except MissingDependencyError as exc:
        print(f"Erro ao criar issue em {owner}/{args.repo}: {exc}", file=sys.stderr)
        return 1

    if not result.ok:
        print(
            f"Erro ao criar issue em {owner}/{args.repo}: {result.stderr.strip()}", file=sys.stderr
        )
        return 1

    print(f"Issue criada: {result.stdout.strip()}")
    return 0
