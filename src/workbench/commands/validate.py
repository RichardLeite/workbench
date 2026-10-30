"""Validações de branch, spec e corpo de PR."""

from __future__ import annotations

import re
import sys
from argparse import ArgumentParser, Namespace, _SubParsersAction
from pathlib import Path

from workbench.errors import ExternalCommandError, MissingDependencyError
from workbench.paths import workbench_root
from workbench.process import run

BRANCH_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"feat/TASK-\d+"), "meu-projeto SPRINT"),
    (re.compile(r"fix/TASK-\d+"), "meu-projeto HOTFIX"),
    (re.compile(r"(fix|feat)/TASK-\d+-release"), "backport para release"),
    (
        re.compile(r"(feat|fix|chore|refactor|docs|test|perf)/[a-z0-9]+(-[a-z0-9]+)*"),
        ".workbench kebab",
    ),
    (
        re.compile(r"(feat|fix|chore|refactor|docs|test|perf)\([a-z0-9_-]+\):\s[a-z0-9].+"),
        ".workbench conventional commit",
    ),
    (re.compile(r"refactor/[a-z0-9]+(-[a-z0-9]+)*"), "refactor genérico"),
    (re.compile(r"docs/[a-z0-9]+(-[a-z0-9]+)*"), "docs genérico"),
]

PR_CHECKS = [
    ('Seção "O que mudou?"', lambda body: "## O que mudou?" in body),
    ('Seção "Por quê?"', lambda body: "## Por quê?" in body),
    (
        'Seção "Evidências"',
        lambda body: "## Evidências" in body or "## Evidencias" in body,
    ),
    (
        'Seção "Possíveis riscos"',
        lambda body: "## Possíveis riscos" in body or "## Riscos" in body,
    ),
    ('Seção "Rollback"', lambda body: "## Rollback" in body),
    ('Seção "Commits"', lambda body: "## Commits" in body),
    ("Checklist presente", lambda body: "- [" in body),
    ("Corpo em português", lambda body: bool(re.search(r"[áàâãéèêíïóôõöúç]", body, re.I))),
]


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser("validate", help="Validações de branch/spec/PR.")
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    validate_sub = parser.add_subparsers(dest="validate_command", required=True)

    branch = validate_sub.add_parser("branch", help="Valida o nome de uma branch.")
    branch.add_argument("branch", nargs="?", default=None)
    branch.set_defaults(handler=_run_branch)

    spec = validate_sub.add_parser("spec", help="Valida o formato de uma spec.")
    spec.add_argument("path")
    spec.set_defaults(handler=_run_spec)

    pr = validate_sub.add_parser("pr", help="Valida o corpo de um PR via gh CLI.")
    pr.add_argument("number")
    pr.add_argument("--owner", default=None)
    pr.add_argument("--repo", default=".workbench")
    pr.set_defaults(handler=_run_pr)


def _current_branch() -> str | None:
    try:
        result = run(["git", "rev-parse", "--abbrev-ref", "HEAD"], timeout=5)
    except (MissingDependencyError, Exception):
        return None
    if not result.ok:
        return None
    return result.stdout.strip() or None


def _run_branch(args: Namespace) -> int:
    branch = args.branch or _current_branch()
    if not branch:
        print("❌ Não foi possível determinar a branch atual.", file=sys.stderr)
        return 2

    if branch in {"main", "release", "develop"}:
        print(f"⚠️  Branch '{branch}' é protegida. Não deve receber commits diretos.")
        print(f"   Crie uma branch a partir dela: git checkout -B feat/... origin/{branch}")
        return 0

    for pattern, context in BRANCH_RULES:
        if pattern.fullmatch(branch):
            print(f"✅ Branch '{branch}' é válida ({context}).")
            return 0

    print(f"❌ Branch '{branch}' não corresponde a nenhum padrão conhecido.")
    print("   Padrões válidos:")
    print("   - feat/TASK-1234 (SPRINT)")
    print("   - fix/TASK-1234 (HOTFIX)")
    print("   - fix/TASK-1234-release (HOTFIX → release)")
    print("   - feat/add-feature (workbench)")
    print("   - fix/TASK-1234-descricao (opcional)")
    return 1


def _run_spec(args: Namespace) -> int:
    root = workbench_root()
    spec_path = Path(args.path)
    full_path = spec_path if spec_path.is_absolute() else (root / spec_path)
    if not full_path.is_file():
        print(f"❌ Arquivo não encontrado: {full_path}", file=sys.stderr)
        return 1

    content = full_path.read_text(encoding="utf-8")
    errors: list[str] = []
    warnings: list[str] = []

    if not re.search(r"^# Spec:", content, re.M):
        errors.append("Falta título '## Spec:'")

    modules = list(re.finditer(r"^### Módulo \d+:", content, re.M))
    if not modules:
        errors.append("Nenhum módulo encontrado (padrão: '### Módulo N:')")
    else:
        for module in modules:
            name = module.group(0)
            line = content[: module.start()].count("\n") + 1
            next_module = re.search(r"\n### Módulo \d+:", content[module.start() + 1 :])
            end = module.start() + 1 + next_module.start() if next_module else len(content)
            module_content = content[module.start() : end]
            if "#### Descrição" not in module_content:
                warnings.append(f"Módulo \"{name}\" (linha {line}): sem seção '#### Descrição'")
            if (
                "#### Requisitos" not in module_content
                and "#### Implementação" not in module_content
            ):
                warnings.append(
                    f'Módulo "{name}" (linha {line}): '
                    "sem '#### Requisitos' nem '#### Implementação'"
                )

    has_scenario = all(
        re.search(rf"-\s+\*\*{step}\*\*", content, re.I) for step in ("GIVEN", "WHEN", "THEN")
    )
    if modules and not has_scenario:
        warnings.append(
            "Nenhum cenário GIVEN/WHEN/THEN encontrado — critérios podem não ser testáveis"
        )

    if "#### Implementação" not in content:
        errors.append("Falta seção '#### Implementação'")
    if "#### Validação" not in content:
        errors.append("Falta seção '#### Validação'")

    print(f"\n📋 Validação de Spec: {spec_path.name}")
    print(f"   Módulos encontrados: {len(modules)}")
    print(f"   Total de linhas: {content.count(chr(10)) + 1}")

    if not errors and not warnings:
        print("\n✅ Spec válida — formato modular compatível com /execute-spec\n")
        return 0

    if errors:
        print(f"\n❌ {len(errors)} erro(s):")
        for error in errors:
            print(f"   • {error}")
    if warnings:
        print(f"\n⚠️  {len(warnings)} aviso(s):")
        for warning in warnings:
            print(f"   • {warning}")
    print()
    return 1 if errors else 0


def _run_pr(args: Namespace) -> int:
    owner = args.owner or ""
    repo = args.repo
    try:
        result = run(
            ["gh", "api", f"repos/{owner}/{repo}/pulls/{args.number}", "--jq", ".body"],
            timeout=15,
        )
    except (MissingDependencyError, ExternalCommandError) as exc:
        print(f"❌ Erro ao validar PR #{args.number}: {exc}", file=sys.stderr)
        return 2
    if not result.ok:
        print(f"❌ Erro ao validar PR #{args.number}: {result.stderr.strip()}", file=sys.stderr)
        return 2

    body = result.stdout.strip()
    failed = [name for name, check in PR_CHECKS if not check(body)]
    if not failed:
        print(f"✅ PR #{args.number}: todas as {len(PR_CHECKS)} validações passaram.")
        return 0

    print(f"❌ PR #{args.number}: {len(failed)}/{len(PR_CHECKS)} validações falharam:")
    for name in failed:
        print(f"   - {name}")
    return 1
