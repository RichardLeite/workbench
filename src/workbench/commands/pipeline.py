"""Comandos do SDD Pipeline (subconjunto migrado)."""

from __future__ import annotations

import json
import sys
from argparse import ArgumentParser, Namespace, _SubParsersAction
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from workbench.config import load_config
from workbench.paths import workbench_root

STATE_SCHEMA = {
    "type": "object",
    "required": [
        "tipo",
        "slug",
        "descricao",
        "projeto",
        "fase_atual",
        "status",
        "artefatos",
        "created_at",
        "updated_at",
    ],
    "properties": {
        "tipo": {"type": "string", "pattern": "^pipeline_state$"},
        "slug": {"type": "string", "minLength": 1},
        "descricao": {"type": "string", "minLength": 1},
        "task_id": {"type": "string", "default": ""},
        "projeto": {"type": "string", "minLength": 1},
        "ado_project": {"type": ["string", "null"], "default": None},
        "fase_atual": {"type": "string", "minLength": 1},
        "status": {"type": "string", "enum": ["in_progress", "completed"]},
        "artefatos": {"type": "object"},
        "created_at": {"type": "string"},
        "updated_at": {"type": "string"},
    },
}

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

    state = pipeline_sub.add_parser("state", help="Gerencia o estado do pipeline.")
    state_sub = state.add_subparsers(dest="state_command", required=True)
    create = state_sub.add_parser("create", help="Cria um state.")
    create.add_argument("slug")
    create.add_argument("descricao")
    create.add_argument("task_id", nargs="?", default="")
    create.add_argument("projeto", nargs="?", default="workbench")
    create.set_defaults(handler=_run_state_create)
    load = state_sub.add_parser("load", help="Carrega um state.")
    load.add_argument("slug")
    load.set_defaults(handler=_run_state_load)
    resume = state_sub.add_parser("resume", help="Verifica se há pipeline anterior.")
    resume.add_argument("slug")
    resume.set_defaults(handler=_run_state_resume)

    report = pipeline_sub.add_parser("report", help="Gera relatório do pipeline.")
    report_sub = report.add_subparsers(dest="report_command", required=True)
    success = report_sub.add_parser("success", help="Relatório de sucesso.")
    success.add_argument("path")
    success.set_defaults(handler=_run_report_success)
    partial = report_sub.add_parser("partial", help="Relatório parcial.")
    partial.add_argument("path")
    partial.add_argument("motivo", nargs="?", default="Interrompido")
    partial.add_argument("fase", nargs="?", default="?")
    partial.set_defaults(handler=_run_report_partial)

    feature = pipeline_sub.add_parser("feature-gen", help="Gera conteúdo de feature.")
    feature.add_argument("json")
    feature.set_defaults(handler=_run_feature_gen)

    schema = pipeline_sub.add_parser("schema", help="Schema do state.")
    schema.set_defaults(handler=_run_schema)


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


def plans_dir(root: Path | None = None) -> Path:
    directory = (root or _root()) / ".opencode" / "plans"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def state_path(slug: str, root: Path | None = None) -> Path:
    return plans_dir(root) / f"pipeline-state-{slug}.json"


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def create_state(
    slug: str,
    descricao: str,
    task_id: str = "",
    projeto: str = "workbench",
    ado_project: str | None = None,
) -> dict[str, Any]:
    now = _now()
    return {
        "tipo": "pipeline_state",
        "slug": slug,
        "descricao": descricao,
        "task_id": task_id,
        "projeto": projeto,
        "ado_project": ado_project,
        "fase_atual": "0",
        "status": "in_progress",
        "artefatos": {},
        "created_at": now,
        "updated_at": now,
    }


def load_state(slug: str, root: Path | None = None) -> dict[str, Any] | None:
    path = state_path(slug, root)
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save_state(state: dict[str, Any], root: Path | None = None) -> Path:
    state["updated_at"] = _now()
    path = state_path(str(state["slug"]), root)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def resume_prompt(slug: str, root: Path | None = None) -> dict[str, Any]:
    state = load_state(slug, root)
    if state is None:
        return {"exists": False, "state": None, "prompt": None}
    if state.get("status") == "completed":
        return {
            "exists": True,
            "state": state,
            "prompt": (
                f"Pipeline anterior encontrado (já concluído na fase {state.get('fase_atual')}). "
                "Deseja recomeçar do zero?"
            ),
        }
    return {
        "exists": True,
        "state": state,
        "prompt": (
            f"Pipeline anterior encontrado (parou na fase {state.get('fase_atual')}). "
            "Deseja retomar de onde parou ou começar do zero?"
        ),
    }


def _box_line(content: str) -> str:
    return "║" + content.ljust(59) + "║"


def generate_success_report(state: dict[str, Any], stats: dict[str, Any] | None = None) -> str:
    s = stats or {}
    gate_issues = s.get("gateIssues") or 0
    issues_label = "leves" if gate_issues > 0 else "nenhuma"
    modules = f"{s.get('concluidos') or '?'}/{s.get('totalModulos') or '?'}"
    tests = str(s.get("testesPassando") or "?")
    lines = [
        "╔═══════════════════════════════════════════════════════════╗",
        "║  SDD Pipeline — Relatório Final                          ║",
        "╠═══════════════════════════════════════════════════════════╣",
        f"║  Feature:   {str(state.get('descricao', '')).ljust(47)}║",
        f"║  Spec:      specs/spec-{state.get('slug')}.md".ljust(55) + "║",
        "║                                                           ║",
        "║  FASE 1 — Especificação                          ✅ ok    ║",
        "║  FASE 2 — Validação (Gate)                       ✅ ok    ║",
        _box_line(f"    ├── Issues:                {gate_issues} {issues_label}            "),
        "║                                                           ║",
        "║  FASE 3 — Execução                                ✅ ok    ║",
        _box_line(f"    ├── Módulos:               {modules} concluídos          "),
        _box_line(f"    ├── Testes:                {tests} passando                "),
        "║                                                           ║",
        "║  FASE 4 — Finalização                            ✅ ok    ║",
        "║                                                           ║",
        "╚═══════════════════════════════════════════════════════════╝",
    ]
    return "\n".join(lines)


def generate_partial_report(state: dict[str, Any], motivo: str, fase_interrompida: str) -> str:
    artefatos = state.get("artefatos") or {}
    next_step = (
        "Corrigir spec e re-validar"
        if fase_interrompida.startswith("2")
        else "Reformular módulo pendente"
        if fase_interrompida.startswith("3")
        else "Reiniciar pipeline"
    )
    fase1 = "✅ ok" if artefatos.get("spec") else "⏳ N/A"
    fase2 = "✅ ok" if artefatos.get("gate_tech_lead") else "⏳ N/A"
    fase3 = "⚠️ parcial" if artefatos.get("execucao") else "⏳ N/A"
    lines = [
        "╔═══════════════════════════════════════════════════════════╗",
        "║  SDD Pipeline — Relatório Parcial                        ║",
        "╠═══════════════════════════════════════════════════════════╣",
        f"║  Feature:   {str(state.get('descricao', '')).ljust(47)}║",
        f"║  Status:    PARCIAL — interrompido em {fase_interrompida}".ljust(55) + "║",
        f"║  Motivo:    {motivo.ljust(47)}║",
        "║                                                           ║",
        _box_line(f"  FASE 1 — Especificação              {fase1}    "),
        _box_line(f"  FASE 2 — Validação (Gate)           {fase2}    "),
        _box_line(f"  FASE 3 — Execução                   {fase3}    "),
        "║  FASE 4 — Finalização                ⏳ N/A    ║",
        "║                                                           ║",
        f"║  Checkpoint:  .opencode/plans/pipeline-state-{state.get('slug')}.json".ljust(55) + "║",
        "║  Próximo passo: " + next_step.ljust(44) + "║",
        "╚═══════════════════════════════════════════════════════════╝",
    ]
    return "\n".join(lines)


def generate_feature_content(analise: dict[str, Any]) -> str:
    criterios = "\n".join(f"- [ ] **{item}**" for item in analise.get("criterios_aceite") or [])
    stakeholders = "\n".join(f"- {item}" for item in analise.get("stakeholders") or [])
    riscos = "\n".join(f"- {item}" for item in analise.get("riscos") or [])
    return "\n".join(
        [
            f"# Feature: {analise.get('titulo')}",
            "",
            "## Descrição",
            "",
            str(analise.get("descricao") or ""),
            "",
            "## Critérios de Aceite",
            "",
            criterios or "- Nenhum critério definido",
            "",
            "## Stakeholders",
            "",
            stakeholders or "- Não definido",
            "",
            "## Riscos",
            "",
            riscos or "- Não mapeados",
            "",
            "## Notas Técnicas",
            "",
            str(analise.get("notas_tecnicas") or "- Nenhuma"),
            "",
        ]
    )


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


def _run_state_create(args: Namespace) -> int:
    state = create_state(args.slug, args.descricao, args.task_id, args.projeto)
    path = save_state(state)
    _print_json({"state": state, "filePath": str(path)})
    return 0


def _run_state_load(args: Namespace) -> int:
    state = load_state(args.slug)
    if state is None:
        print(f'ERRO: State "{args.slug}" não encontrado', file=sys.stderr)
        return 1
    _print_json(state)
    return 0


def _run_state_resume(args: Namespace) -> int:
    _print_json(resume_prompt(args.slug))
    return 0


def _read_state(path_arg: str) -> dict[str, Any]:
    path = Path(path_arg)
    absolute = path if path.is_absolute() else _root() / path
    return json.loads(absolute.read_text(encoding="utf-8"))


def _run_report_success(args: Namespace) -> int:
    state = _read_state(args.path)
    print(generate_success_report(state))
    return 0


def _run_report_partial(args: Namespace) -> int:
    state = _read_state(args.path)
    print(generate_partial_report(state, args.motivo, args.fase))
    return 0


def _run_feature_gen(args: Namespace) -> int:
    analise = json.loads(args.json)
    print(generate_feature_content(analise))
    return 0


def _run_schema(args: Namespace) -> int:
    _print_json(STATE_SCHEMA)
    return 0
