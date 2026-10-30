"""Comandos do SDD Pipeline (subconjunto migrado)."""

from __future__ import annotations

import json
import sys
from argparse import ArgumentParser, Namespace, _SubParsersAction
from datetime import datetime
from pathlib import Path
from typing import Any

from workbench.config import load_config
from workbench.paths import workbench_root

GATE_MATRIX = {
    "approved": {
        "blocked": "blocked",
        "needs_changes": "needs_changes",
        "approved": "approved",
    },
    "needs_changes": {
        "blocked": "blocked",
        "needs_changes": "needs_changes",
        "approved": "approved_with_warning",
    },
    "blocked": {"blocked": "blocked", "needs_changes": "blocked", "approved": "blocked"},
    "failed": {
        "blocked": "blocked",
        "needs_changes": "blocked",
        "approved": "approved_with_warning",
    },
}

GATE_ACTIONS = {
    "approved": "✅ Avança para Fase 3",
    "needs_changes": "⚠️ Avança com ressalva (issues leves)",
    "approved_with_warning": "⚠️ Avança com warning (um revisor falhou)",
    "blocked": "🔴 Pausa pipeline — issues GRAVES ou gate indeterminado",
}


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser("pipeline", help="SDD Pipeline.")
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    pipeline_sub = parser.add_subparsers(dest="pipeline_command", required=True)

    select = pipeline_sub.add_parser("select-agent", help="Seleciona agente por projeto/camada.")
    select.add_argument("project")
    select.add_argument("layer")
    select.set_defaults(handler=_run_select_agent)

    validate = pipeline_sub.add_parser("validate", help="Valida um state ou todos.")
    validate.add_argument("path", nargs="?", default=None)
    validate.set_defaults(handler=_run_validate)

    phase = pipeline_sub.add_parser("phase", help="Configuração de uma fase.")
    phase.add_argument("phase_id")
    phase.set_defaults(handler=_run_phase)

    phases = pipeline_sub.add_parser("phases", help="Lista fases.")
    phases.add_argument("--skip-optional", action="store_true")
    phases.set_defaults(handler=_run_phases)

    gate = pipeline_sub.add_parser("gate-eval", help="Avalia o gate.")
    gate.add_argument("tl_status", nargs="?", default="failed")
    gate.add_argument("qa_ok", nargs="?", default="false")
    gate.set_defaults(handler=_run_gate)


def _root() -> Path:
    return workbench_root()


def load_rules(root: Path | None = None) -> dict[str, Any]:
    config = load_config("pipeline-rules.json", root)
    return config


def select_agent(project: str, layer: str, root: Path | None = None) -> str | None:
    rules = load_rules(root)
    projects = rules.get("agentes_por_projeto", {})
    mapping = projects.get(project, projects.get("default", {}))
    if not isinstance(mapping, dict):
        return None
    value = mapping.get(layer)
    return value if isinstance(value, str) else None


def get_phase_config(phase_id: str, root: Path | None = None) -> dict[str, Any] | None:
    rules = load_rules(root)
    for phase in rules.get("fases", []):
        if phase.get("id") == phase_id:
            return phase
    return None


def get_phases(skip_optional: bool = False, root: Path | None = None) -> list[dict[str, Any]]:
    rules = load_rules(root)
    phases = rules.get("fases", [])
    if skip_optional:
        return [phase for phase in phases if not phase.get("opcional")]
    return phases


def _valid_iso(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def validate_state(state: dict[str, Any], source: str | None = None) -> dict[str, Any]:
    errors: list[str] = []
    label = f"[{source}] " if source else ""
    if state.get("tipo") != "pipeline_state":
        errors.append(f'{label}tipo DEVE ser "pipeline_state"')
    if state.get("status") not in {"in_progress", "completed"}:
        errors.append(f'{label}status inválido: "{state.get("status")}"')
    for field in ("slug", "descricao", "projeto", "fase_atual"):
        value = state.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{label}{field} DEVE ser string não vazia")
    for field in ("created_at", "updated_at"):
        if not _valid_iso(state.get(field)):
            errors.append(f"{label}{field} não é ISO date válido")
    if state.get("status") == "completed" and state.get("artefatos"):
        for key, value in state["artefatos"].items():
            if isinstance(value, dict) and value.get("status") == "pending":
                errors.append(f'{label}artefato "{key}" está "pending" mas pipeline "completed"')
    return {"ok": not errors, "errors": errors}


def validate_all_states(root: Path | None = None) -> dict[str, Any]:
    plans = (root or _root()) / ".opencode" / "plans"
    if not plans.exists():
        return {"ok": True, "errors": [], "files": 0, "passed": 0, "failed": 0}
    errors: list[str] = []
    files = passed = failed = 0
    for entry in sorted(plans.iterdir()):
        if not entry.is_file() or entry.suffix != ".json":
            continue
        files += 1
        try:
            state = json.loads(entry.read_text(encoding="utf-8"))
            result = validate_state(state, entry.name)
            if result["ok"]:
                passed += 1
            else:
                failed += 1
                errors.extend(result["errors"])
        except json.JSONDecodeError as exc:
            failed += 1
            errors.append(f"[{entry.name}] Erro ao ler JSON: {exc}")
    return {"ok": not errors, "errors": errors, "files": files, "passed": passed, "failed": failed}


def evaluate_gate(tech_lead: dict[str, Any], qa: dict[str, Any]) -> dict[str, str]:
    tl_status = tech_lead.get("status") or "failed"
    qa_status = "blocked" if qa.get("ok") is False else (qa.get("status") or "approved")
    status = GATE_MATRIX.get(tl_status, GATE_MATRIX["failed"]).get(qa_status, "blocked")
    return {"status": status, "acao": GATE_ACTIONS.get(status, GATE_ACTIONS["blocked"])}


def _print_json(payload: Any) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def _run_select_agent(args: Namespace) -> int:
    _print_json(
        {
            "project": args.project,
            "layer": args.layer,
            "agent": select_agent(args.project, args.layer),
        }
    )
    return 0


def _run_validate(args: Namespace) -> int:
    root = _root()
    if args.path:
        path = Path(args.path)
        absolute = path if path.is_absolute() else root / path
        if not absolute.is_file():
            print(f"ERRO: Arquivo não encontrado: {args.path}", file=sys.stderr)
            return 1
        state = json.loads(absolute.read_text(encoding="utf-8"))
        result = validate_state(state, args.path)
        if result["ok"]:
            print("✅ Pipeline state validation passed.")
            return 0
        for error in result["errors"]:
            print(f"❌ {error}", file=sys.stderr)
        return 1

    result = validate_all_states(root)
    if result["ok"]:
        print(
            f"✅ Pipeline state validation passed. ({result['files']} files, "
            f"{result['passed']} passed)"
        )
        return 0
    print(f"❌ {result['failed']}/{result['files']} errors", file=sys.stderr)
    for error in result["errors"]:
        print(f"   {error}", file=sys.stderr)
    return 1


def _run_phase(args: Namespace) -> int:
    config = get_phase_config(args.phase_id)
    if config is None:
        print(f'ERRO: Fase "{args.phase_id}" não encontrada', file=sys.stderr)
        return 1
    _print_json(config)
    return 0


def _run_phases(args: Namespace) -> int:
    _print_json(get_phases(args.skip_optional))
    return 0


def _run_gate(args: Namespace) -> int:
    _print_json(evaluate_gate({"status": args.tl_status}, {"ok": args.qa_ok == "true"}))
    return 0
