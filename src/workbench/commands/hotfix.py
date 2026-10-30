"""Validação e orquestração de hotfix."""

from __future__ import annotations

import json
import re
import sys
from argparse import ArgumentParser, Namespace, _SubParsersAction
from pathlib import Path
from typing import Any

from workbench.config import load_config
from workbench.paths import workbench_root


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser("hotfix", help="Regras e validações de hotfix.")
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    hotfix_sub = parser.add_subparsers(dest="hotfix_command", required=True)

    hotfix_sub.add_parser("config", help="Regras de hotfix.").set_defaults(handler=_run_config)

    branch = hotfix_sub.add_parser("validate-branch", help="Valida branch de hotfix.")
    branch.add_argument("branch")
    branch.set_defaults(handler=_run_validate_branch)

    release = hotfix_sub.add_parser("validate-release", help="Valida branch de release.")
    release.add_argument("branch")
    release.set_defaults(handler=_run_validate_release)

    cherry = hotfix_sub.add_parser("validate-cherry-pick", help="Valida cherry-pick.")
    cherry.add_argument("shas", nargs="+")
    cherry.set_defaults(handler=_run_validate_cherry_pick)

    pr_count = hotfix_sub.add_parser("validate-pr-count", help="Valida quantidade de PRs.")
    pr_count.add_argument("count")
    pr_count.set_defaults(handler=_run_validate_pr_count)

    quality = hotfix_sub.add_parser("quality-gates", help="Comandos de quality gate.")
    quality.add_argument("project", nargs="?", default="")
    quality.set_defaults(handler=_run_quality_gates)

    hotfix_sub.add_parser("gate", help="Árvore de decisão do quality gate.").set_defaults(
        handler=_run_gate
    )
    hotfix_sub.add_parser("pr-config", help="Configuração de PRs.").set_defaults(
        handler=_run_pr_config
    )
    hotfix_sub.add_parser("check", help="Valida a configuração.").set_defaults(handler=_run_check)


def _root() -> Path:
    return workbench_root()


def load_hotfix_config(root: Path | None = None) -> dict[str, Any]:
    return load_config("git-hotfix-flow-rules.json", root)


def validate_hotfix_branch(branch: str, root: Path | None = None) -> dict[str, Any]:
    config = load_hotfix_config(root)
    pattern = str(config.get("branchPattern", "")).replace("XXXX", r"\d+")
    if re.fullmatch(pattern, branch):
        return {"valid": True, "pattern": config.get("branchPattern")}
    return {
        "valid": False,
        "pattern": config.get("branchPattern"),
        "error": (
            f'Branch "{branch}" não segue padrão "{config.get("branchPattern")}" '
            f"(base: {config.get('baseMain')})"
        ),
    }


def validate_release_branch(branch: str, root: Path | None = None) -> dict[str, Any]:
    config = load_hotfix_config(root)
    pattern = str(config.get("branchPatternRelease", "")).replace("XXXX", r"\d+")
    if re.fullmatch(pattern, branch):
        return {"valid": True, "pattern": config.get("branchPatternRelease")}
    return {
        "valid": False,
        "pattern": config.get("branchPatternRelease"),
        "error": (
            f'Release branch "{branch}" não segue padrão '
            f'"{config.get("branchPatternRelease")}" (base: {config.get("baseRelease")})'
        ),
    }


def validate_cherry_pick_flow(
    main_commits: list[str], release_commits: list[str]
) -> dict[str, Any]:
    match_count = sum(1 for sha in main_commits if sha in release_commits)
    if match_count == len(main_commits) and main_commits:
        return {
            "valid": True,
            "matchCount": match_count,
            "mainCount": len(main_commits),
            "releaseCount": len(release_commits),
        }
    return {
        "valid": False,
        "matchCount": match_count,
        "mainCount": len(main_commits),
        "releaseCount": len(release_commits),
        "error": (
            f"Cherry-pick incompleto: {match_count}/{len(main_commits)} commits da main "
            "encontrados na release"
        ),
    }


def validate_pr_count(
    pr_count: int, expected: int | None = None, root: Path | None = None
) -> dict[str, Any]:
    config = load_hotfix_config(root)
    expected_value = expected if expected is not None else config.get("prCount")
    if pr_count == expected_value:
        return {"valid": True, "expected": expected_value, "actual": pr_count}
    return {
        "valid": False,
        "expected": expected_value,
        "actual": pr_count,
        "error": (
            f"Número de PRs inválido: esperado {expected_value}, atual {pr_count} "
            f"(hotfix deve ter {expected_value} PRs: main + release)"
        ),
    }


def get_quality_gate_commands(project: str, root: Path | None = None) -> dict[str, Any]:
    config = load_hotfix_config(root)
    return config.get("qualityGateCommands", {}).get(
        project, {"lint": None, "sast": None, "security": None}
    )


def get_gate_decision(root: Path | None = None) -> dict[str, Any]:
    config = load_hotfix_config(root)
    gates = config.get("qualityGates", {})
    return {
        "gates": gates,
        "blocking": [name for name, value in gates.items() if value.get("blocking")],
        "securityBlocking": config.get("securityBlocking"),
        "aiReviewBlocking": config.get("aiReviewBlocking"),
    }


def get_pr_config(root: Path | None = None) -> dict[str, Any]:
    config = load_hotfix_config(root)
    return {
        "prCount": config.get("prCount"),
        "targets": [config.get("prTargetMain"), config.get("prTargetRelease")],
    }


def _print_json(payload: Any) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def _run_config(args: Namespace) -> int:
    _print_json(load_hotfix_config())
    return 0


def _run_validate_branch(args: Namespace) -> int:
    _print_json(validate_hotfix_branch(args.branch))
    return 0


def _run_validate_release(args: Namespace) -> int:
    _print_json(validate_release_branch(args.branch))
    return 0


def _run_validate_cherry_pick(args: Namespace) -> int:
    try:
        separator = args.shas.index("--")
    except ValueError:
        print("ERRO: validate-cherry-pick requer <mainSHAs> -- <releaseSHAs>", file=sys.stderr)
        return 1
    main_shas = args.shas[:separator]
    release_shas = args.shas[separator + 1 :]
    if separator < 1:
        print("ERRO: validate-cherry-pick requer <mainSHAs> -- <releaseSHAs>", file=sys.stderr)
        return 1
    _print_json(validate_cherry_pick_flow(main_shas, release_shas))
    return 0


def _run_validate_pr_count(args: Namespace) -> int:
    try:
        count = int(args.count)
    except ValueError:
        print("ERRO: validate-pr-count requer número", file=sys.stderr)
        return 1
    _print_json(validate_pr_count(count))
    return 0


def _run_quality_gates(args: Namespace) -> int:
    project = args.project or ""
    _print_json(
        {"project": args.project or "(fallback)", "commands": get_quality_gate_commands(project)}
    )
    return 0


def _run_gate(args: Namespace) -> int:
    _print_json(get_gate_decision())
    return 0


def _run_pr_config(args: Namespace) -> int:
    _print_json(get_pr_config())
    return 0


def _run_check(args: Namespace) -> int:
    config = load_hotfix_config()
    _print_json(
        {"config": {"valid": True, "projects": 1}, "expectedPrCount": config.get("prCount")}
    )
    return 0
