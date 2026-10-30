"""Sprint task definitions e validações."""

from __future__ import annotations

import json
import re
import sys
from argparse import ArgumentParser, Namespace, _SubParsersAction
from pathlib import Path
from typing import Any

from workbench.config import ConfigError, load_config
from workbench.paths import workbench_root

REQUIRED_FIELDS = [
    "title",
    "activity",
    "oe",
    "rw",
    "workedTime",
    "tipo",
    "condicao",
    "ordem",
    "descricaoCurta",
]

EXCLUDED_DOC_PREFIXES = [
    ".opencode/knowledge",
    ".opencode/backlog/adr",
    ".opencode/scripts/tests/fixtures",
    ".opencode/plans",
]

TASK_ROW = re.compile(
    r"^\|\s*\d+\s*\|.*(?:Frontend|Backend|Database|Code Review|Task Owner|PM Validation|Testing)",
    re.I,
)
FRONTEND_COND = re.compile(r"^\|\s*\d+\s*\|.*Frontend.*Condicional", re.I | re.M)
CODE_REVIEW_FIXA = re.compile(r"^\|\s*\d+\s*\|.*Code Review.*Fixa", re.I | re.M)


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser("sprint", help="Sprint tasks e validações.")
    parser.add_argument("--json", action="store_true", help="Saída JSON.")
    sprint_sub = parser.add_subparsers(dest="sprint_command", required=True)

    sprint_sub.add_parser("definitions", help="Imprime as definições de tasks.").set_defaults(
        handler=_run_definitions
    )
    for name, scope in (
        ("validate", None),
        ("check", None),
        ("module-only", "module"),
        ("duplicates-only", "duplicates"),
        ("story-points-only", "story_points"),
        ("broken-refs-only", "broken_refs"),
    ):
        sub = sprint_sub.add_parser(name, help="Executa validações de sprint.")
        sub.set_defaults(handler=_run_validate, scope=scope)

    branch = sprint_sub.add_parser("validate-branch", help="Valida branch de sprint.")
    branch.add_argument("branch")
    branch.set_defaults(handler=_run_branch)

    quality = sprint_sub.add_parser("quality-gates", help="Comandos de quality gate.")
    quality.add_argument("project", nargs="?", default="")
    quality.set_defaults(handler=_run_quality_gates)

    sprint_sub.add_parser("gate", help="Árvore de decisão do quality gate.").set_defaults(
        handler=_run_gate
    )


def _root() -> Path:
    return workbench_root()


def load_tasks(root: Path | None = None) -> list[dict[str, Any]]:
    config = load_config("sprint-rules.json", root)
    tasks = config.get("tasks")
    if not isinstance(tasks, list):
        raise ConfigError("sprint-rules.json não contém 'tasks'")
    return tasks


def _js_type(value: Any) -> str:
    if value is None:
        return "object"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    return type(value).__name__


def validate_module(
    tasks: list[dict[str, Any]] | None = None, root: Path | None = None
) -> dict[str, Any]:
    errors: list[str] = []
    data = tasks if tasks is not None else load_tasks(root)

    if not isinstance(data, list):
        return {"ok": False, "errors": ["Módulo não exporta um array"]}
    if len(data) != 7:
        errors.append(f"Array deve ter exatamente 7 itens, encontrado {len(data)}")

    for index, task in enumerate(data):
        missing = [field for field in REQUIRED_FIELDS if field not in task]
        if missing:
            errors.append(
                f'Item {index} ("{task.get("title") or "?"}") campos faltando: {", ".join(missing)}'
            )

    conditionals = [task for task in data if task.get("tipo") == "condicional"]
    if len(conditionals) != 3:
        errors.append(f"Devem existir 3 tasks condicionais, encontrado {len(conditionals)}")
    for task in conditionals:
        title = task.get("title")
        oe = task.get("oe")
        rw = task.get("rw")
        if oe is not None:
            errors.append(f'Condicional "{title}" — oe deve ser null, encontrado: {oe}')
        if rw is not None:
            errors.append(f'Condicional "{title}" — rw deve ser null, encontrado: {rw}')

    fixed = [task for task in data if task.get("tipo") == "fixa"]
    if len(fixed) != 4:
        errors.append(f"Devem existir 4 tasks fixas, encontrado {len(fixed)}")
    for task in fixed:
        oe = task.get("oe")
        rw = task.get("rw")
        if not isinstance(oe, (int, float)) or isinstance(oe, bool):
            errors.append(
                f'Fixa "{task.get("title")}" — oe deve ser número, encontrado: {_js_type(oe)}'
            )
        if not isinstance(rw, (int, float)) or isinstance(rw, bool):
            errors.append(
                f'Fixa "{task.get("title")}" — rw deve ser número, encontrado: {_js_type(rw)}'
            )

    database = [task for task in data if "database" in str(task.get("title", "")).lower()]
    if len(database) != 1:
        errors.append(f"Deve existir exatamente 1 task de Database, encontrado {len(database)}")

    story_points = re.compile(r"story\s*points", re.I)
    for index, task in enumerate(data):
        for key, value in task.items():
            if isinstance(value, str) and story_points.search(value):
                title = task.get("title")
                errors.append(
                    f'Item {index} ("{title}") campo "{key}" contém referência a "Story Points"'
                )

    return {"ok": not errors, "errors": errors}


def find_md_files(target: Path) -> list[Path]:
    if target.is_file():
        return [target]
    if not target.exists():
        return []
    return sorted(path for path in target.rglob("*.md") if path.is_file())


def is_excluded_doc_file(relative_path: str) -> bool:
    return any(relative_path.startswith(prefix) for prefix in EXCLUDED_DOC_PREFIXES)


def _relative(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def scan_for_duplicates(
    target: Path | None = None, skip_excluded: bool = False, root: Path | None = None
) -> dict[str, Any]:
    base = root or _root()
    scan_dir = target or (base / ".opencode")
    errors: list[str] = []
    for path in find_md_files(scan_dir):
        relative = _relative(base, path)
        if not skip_excluded and is_excluded_doc_file(relative):
            continue
        content = path.read_text(encoding="utf-8")
        table_lines = [
            str(index + 1)
            for index, line in enumerate(content.split("\n"))
            if TASK_ROW.search(line)
        ]
        has_literal_table = len(table_lines) >= 4
        has_specific_rows = bool(FRONTEND_COND.search(content) or CODE_REVIEW_FIXA.search(content))
        if has_literal_table and has_specific_rows:
            errors.append(
                f"{relative}:{','.join(table_lines)} — tabela literal de tasks encontrada "
                "(deve usar CLI: sprint.js definitions)"
            )
    return {"ok": not errors, "errors": errors}


def scan_for_story_points(
    target: Path | None = None, skip_excluded: bool = False, root: Path | None = None
) -> dict[str, Any]:
    base = root or _root()
    scan_dir = target or (base / ".opencode")
    excluded_file = ".opencode/backlog/adr/ADR-004-sprint-tasks.md"
    errors: list[str] = []
    count = 0
    pattern = re.compile(r"story\s*points", re.I)
    for path in find_md_files(scan_dir):
        relative = _relative(base, path)
        if relative == excluded_file:
            continue
        if not skip_excluded and is_excluded_doc_file(relative):
            continue
        for index, line in enumerate(path.read_text(encoding="utf-8").split("\n")):
            if pattern.search(line):
                count += 1
                errors.append(f'{relative}:{index + 1} — "{line.strip()}"')
    return {"ok": count == 0, "errors": errors, "count": count}


def scan_for_broken_references(
    target: Path | None = None, skip_excluded: bool = False, root: Path | None = None
) -> dict[str, Any]:
    base = root or _root()
    scan_dir = target or (base / ".opencode")
    errors: list[str] = []
    reference = re.compile(r"@\.opencode/(\S+)")
    trailing_punctuation = re.compile(r"[.,;:!?)]+$")

    for path in find_md_files(scan_dir):
        relative = _relative(base, path)
        if not skip_excluded and is_excluded_doc_file(relative):
            continue
        for index, line in enumerate(path.read_text(encoding="utf-8").split("\n")):
            if re.search(r"`@\.opencode/", line):
                continue
            match = reference.search(line)
            if not match:
                continue
            ref_path = trailing_punctuation.sub("", match.group(1))
            if ref_path.startswith("skills/"):
                continue
            absolute = (base / ".opencode" / ref_path).resolve()
            if not absolute.exists():
                errors.append(
                    f"{relative}:{index + 1} — @.opencode/{ref_path} (arquivo não existe)"
                )
    return {"ok": not errors, "errors": errors}


def validate_sprint_branch(branch: str) -> dict[str, Any]:
    pattern = "feat/TASK-XXXX"
    if re.fullmatch(r"feat/TASK-\d+", branch):
        return {"valid": True, "pattern": pattern}
    return {
        "valid": False,
        "pattern": pattern,
        "error": f'Branch "{branch}" não segue padrão "feat/TASK-XXXX"',
    }


def _flow_config(root: Path) -> dict[str, Any] | None:
    path = root / ".opencode" / "config" / "git-sprint-flow-rules.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def get_quality_gate_cmd(project: str, root: Path | None = None) -> dict[str, Any]:
    config = _flow_config(root or _root())
    if not config:
        return {"lint": None, "sast": None, "security": None}
    return config.get("qualityGateCommands", {}).get(
        project, {"lint": None, "sast": None, "security": None}
    )


def get_quality_gate_decision(root: Path | None = None) -> dict[str, Any]:
    config = _flow_config(root or _root())
    if not config:
        return {"gates": {}, "blocking": []}
    gates = config.get("qualityGates", {})
    return {
        "gates": gates,
        "blocking": [name for name, value in gates.items() if value.get("blocking")],
    }


def _print_json(payload: Any) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def _run_definitions(args: Namespace) -> int:
    _print_json(load_tasks(_root()))
    return 0


def _run_validate(args: Namespace) -> int:
    root = _root()
    scope = getattr(args, "scope", None)
    selected = {
        "module": scope in (None, "module"),
        "duplicates": scope in (None, "duplicates"),
        "storyPoints": scope in (None, "story_points"),
        "brokenRefs": scope in (None, "broken_refs"),
    }
    results: dict[str, Any] = {}
    all_errors: list[str] = []
    if selected["module"]:
        results["module"] = validate_module(root=root)
        all_errors.extend(results["module"]["errors"])
    if selected["duplicates"]:
        results["duplicates"] = scan_for_duplicates(root=root)
        all_errors.extend(results["duplicates"]["errors"])
    if selected["storyPoints"]:
        results["storyPoints"] = scan_for_story_points(root=root)
        all_errors.extend(results["storyPoints"]["errors"])
    if selected["brokenRefs"]:
        results["brokenRefs"] = scan_for_broken_references(root=root)
        all_errors.extend(results["brokenRefs"]["errors"])

    passed = not all_errors
    if getattr(args, "json", False):
        _print_json({"passed": passed, "results": results})
    elif passed:
        print("✅ Sprint tasks validation passed.")
    else:
        for error in all_errors:
            print(f"❌ {error}", file=sys.stderr)
    return 0 if passed else 1


def _run_branch(args: Namespace) -> int:
    _print_json(validate_sprint_branch(args.branch))
    return 0


def _run_quality_gates(args: Namespace) -> int:
    project = args.project or ""
    _print_json(
        {"project": args.project or "(fallback)", "commands": get_quality_gate_cmd(project)}
    )
    return 0


def _run_gate(args: Namespace) -> int:
    _print_json(get_quality_gate_decision())
    return 0
