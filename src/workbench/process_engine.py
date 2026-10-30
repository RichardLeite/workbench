"""Motor de processos composáveis do Workbench."""

from __future__ import annotations

import json
import re
import shlex
import subprocess
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from workbench.config import ConfigError, load_opencode
from workbench.paths import workbench_root

PROCESSES_DIR = Path(".opencode") / "processes"
PLANS_DIR = Path(".opencode") / "plans"
SCHEMA_FILE = "schema.json"


@dataclass(slots=True)
class ProcessDefinition:
    name: str
    data: dict[str, Any]
    path: Path

    @property
    def description(self) -> str:
        return str(self.data.get("description") or "")

    @property
    def version(self) -> int:
        return int(self.data.get("version") or 1)

    @property
    def license(self) -> str | None:
        return self.data.get("license")


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _root(root: Path | None = None) -> Path:
    return root or workbench_root()


def _read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ConfigError(f"Processo não encontrado: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ConfigError(f"JSON inválido em {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ConfigError(f"Processo deve ser um objeto JSON: {path}")
    return data


def process_dirs(name: str, project: str | None, root: Path | None = None) -> list[Path]:
    base = _root(root)
    candidates: list[Path] = []
    if project:
        candidates.append(base / "projects" / project / "processes" / name / "process.json")
    candidates.append(base / PROCESSES_DIR / name / "process.json")
    return candidates


def load_process(
    name: str, project: str | None = None, root: Path | None = None
) -> ProcessDefinition:
    for path in process_dirs(name, project, root):
        if path.is_file():
            data = _read_json(path)
            definition = ProcessDefinition(name=name, data=data, path=path)
            errors = validate_process(definition, root)
            if errors:
                raise ConfigError("Processo inválido:\n  " + "\n  ".join(errors))
            return definition
    raise ConfigError(f"Processo não encontrado: {name}")


def list_processes(root: Path | None = None) -> list[dict[str, Any]]:
    base = _root(root) / PROCESSES_DIR
    if not base.exists():
        return []
    processes: list[dict[str, Any]] = []
    for directory in sorted(base.iterdir()):
        if not directory.is_dir() or directory.name.startswith("_"):
            continue
        path = directory / "process.json"
        if not path.is_file():
            continue
        try:
            data = _read_json(path)
        except ConfigError:
            continue
        processes.append(
            {
                "name": directory.name,
                "description": data.get("description"),
                "version": data.get("version"),
                "license": data.get("license"),
                "path": str(path),
            }
        )
    return processes


def schema(root: Path | None = None) -> dict[str, Any]:
    path = _root(root) / PROCESSES_DIR / SCHEMA_FILE
    return _read_json(path)


def _available_agents(root: Path | None = None) -> set[str]:
    try:
        config = load_opencode(_root(root))
    except ConfigError:
        return set()
    return set((config.get("agent") or {}).keys())


def validate_process(process: ProcessDefinition, root: Path | None = None) -> list[str]:
    data = process.data
    errors: list[str] = []
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", process.name):
        errors.append("nome deve usar lowercase, números e hífens")
    if not data.get("description"):
        errors.append("description é obrigatório")
    if not isinstance(data.get("version"), int) or int(data["version"]) < 1:
        errors.append("version deve ser inteiro >= 1")
    stages = data.get("stages")
    if not isinstance(stages, list) or not stages:
        errors.append("stages deve ser uma lista não vazia")
        stages = []
    gates = data.get("gates") or []
    if not isinstance(gates, list):
        errors.append("gates deve ser uma lista")
        gates = []
    gate_ids = {gate.get("id") for gate in gates if isinstance(gate, dict)}
    agents = _available_agents(root)
    agents_by_layer = data.get("agents_by_layer") or {}
    stage_ids: set[str] = set()
    for stage in stages:
        if not isinstance(stage, dict):
            errors.append("cada stage deve ser um objeto")
            continue
        stage_id = stage.get("id")
        if not stage_id:
            errors.append("stage sem id")
            continue
        if stage_id in stage_ids:
            errors.append(f"stage duplicado: {stage_id}")
        stage_ids.add(stage_id)
        agent = stage.get("agent")
        if agent is not None and agents and agent not in agents:
            errors.append(f'stage "{stage_id}" referencia agente inexistente: {agent}')
        if stage.get("agent_by_layer"):
            if not isinstance(agents_by_layer, dict) or not agents_by_layer:
                errors.append(f'stage "{stage_id}" usa agent_by_layer sem agents_by_layer')
            else:
                for layer, layer_agent in agents_by_layer.items():
                    if agents and layer_agent not in agents:
                        errors.append(
                            f'agents_by_layer["{layer}"] referencia agente '
                            f"inexistente: {layer_agent}"
                        )
        gate_id = stage.get("gate")
        if gate_id and gate_id not in gate_ids:
            errors.append(f'stage "{stage_id}" referencia gate inexistente: {gate_id}')
    for gate in gates:
        if not isinstance(gate, dict) or not gate.get("id"):
            errors.append("gate sem id")
            continue
        agent = gate.get("agent")
        if agent and agents and agent not in agents:
            errors.append(f'gate "{gate["id"]}" referencia agente inexistente: {agent}')
        if not gate.get("command") and not agent:
            errors.append(f'gate "{gate["id"]}" precisa de command ou agent')
    artifacts = data.get("artifacts") or []
    if not isinstance(artifacts, list):
        errors.append("artifacts deve ser uma lista")
        artifacts = []
    artifact_ids: set[str] = set()
    for artifact in artifacts:
        if not isinstance(artifact, dict) or not artifact.get("id") or not artifact.get("path"):
            errors.append("cada artifact precisa de id e path")
            continue
        if artifact["id"] in artifact_ids:
            errors.append(f"artifact duplicado: {artifact['id']}")
        artifact_ids.add(artifact["id"])
        template = artifact.get("template")
        if template and not (_root(root) / str(template)).is_file():
            errors.append(f"template de artifact inexistente: {template}")
    return errors


def state_path(process: str, slug: str, root: Path | None = None) -> Path:
    safe_slug = re.sub(r"[^a-z0-9._-]", "_", slug.lower())
    return _root(root) / PLANS_DIR / f"process-state-{process}-{safe_slug}.json"


def create_state(
    process: ProcessDefinition,
    slug: str,
    project: str = "workbench",
    root: Path | None = None,
) -> dict[str, Any]:
    now = now_iso()
    stages = {
        stage["id"]: {
            "status": "pending",
            "agent": stage.get("agent"),
            "artifacts": stage.get("artifacts") or [],
        }
        for stage in process.data.get("stages", [])
        if isinstance(stage, dict) and stage.get("id")
    }
    gates = {
        gate["id"]: {"status": "pending"}
        for gate in process.data.get("gates", [])
        if isinstance(gate, dict) and gate.get("id")
    }
    return {
        "tipo": "process_state",
        "process": process.name,
        "slug": slug,
        "project": project,
        "status": "in_progress",
        "stage_atual": next(iter(stages), None),
        "stages": stages,
        "gates": gates,
        "artifacts": {},
        "created_at": now,
        "updated_at": now,
    }


def save_state(state: dict[str, Any], root: Path | None = None) -> Path:
    state["updated_at"] = now_iso()
    path = state_path(str(state["process"]), str(state["slug"]), root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load_state(process: str, slug: str, root: Path | None = None) -> dict[str, Any] | None:
    path = state_path(process, slug, root)
    if not path.is_file():
        return None
    return _read_json(path)


def resume_prompt(process: str, slug: str, root: Path | None = None) -> dict[str, Any]:
    state = load_state(process, slug, root)
    if state is None:
        return {"exists": False, "state": None, "prompt": None}
    status = state.get("status")
    if status == "completed":
        prompt = f"Processo '{process}' já concluído em '{slug}'. Deseja recomeçar do zero?"
    elif status == "blocked":
        prompt = (
            f"Processo '{process}' bloqueado na fase '{state.get('stage_atual')}'. "
            "Corrija o gate ou reinicie."
        )
    else:
        prompt = (
            f"Processo '{process}' parou na fase '{state.get('stage_atual')}'. "
            "Deseja retomar de onde parou ou começar do zero?"
        )
    return {"exists": True, "state": state, "prompt": prompt}


def plan_payload(process: ProcessDefinition) -> dict[str, Any]:
    data = process.data
    stages = []
    for stage in data.get("stages", []):
        if not isinstance(stage, dict):
            continue
        agent = stage.get("agent")
        if stage.get("agent_by_layer"):
            agent = data.get("agents_by_layer") or {}
        stages.append(
            {
                "id": stage.get("id"),
                "name": stage.get("name"),
                "agent": agent,
                "gate": stage.get("gate"),
                "optional": bool(stage.get("optional", False)),
                "artifacts": stage.get("artifacts") or [],
                "instructions": stage.get("instructions"),
            }
        )
    return {
        "process": process.name,
        "description": process.description,
        "version": process.version,
        "license": process.license,
        "stages": stages,
        "gates": data.get("gates") or [],
        "artifacts": data.get("artifacts") or [],
        "limits": data.get("limits") or {},
        "source": str(process.path),
    }


def _run_command(command: str, root: Path, timeout_min: int) -> dict[str, Any]:
    args = shlex.split(command)
    if not args:
        return {"status": "failed", "exit_code": None, "output": "comando vazio"}
    try:
        completed = subprocess.run(
            args,
            cwd=str(root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_min * 60,
            shell=False,
        )
    except FileNotFoundError:
        return {
            "status": "failed",
            "exit_code": None,
            "output": f"comando não encontrado: {args[0]}",
        }
    except subprocess.TimeoutExpired:
        return {
            "status": "failed",
            "exit_code": None,
            "output": f"timeout após {timeout_min} min",
        }
    output = (completed.stdout + completed.stderr).strip()
    return {
        "status": "passed" if completed.returncode == 0 else "failed",
        "exit_code": completed.returncode,
        "output": output[-4000:],
    }


def run_gate(
    process: ProcessDefinition,
    state: dict[str, Any],
    gate_id: str,
    root: Path | None = None,
    manual_status: str | None = None,
) -> dict[str, Any]:
    gates = [gate for gate in process.data.get("gates", []) if gate.get("id") == gate_id]
    if not gates:
        raise ConfigError(f"Gate não encontrado no processo '{process.name}': {gate_id}")
    gate = gates[0]
    base = _root(root)
    if manual_status:
        if manual_status not in {"approved", "blocked"}:
            raise ConfigError("--status deve ser approved ou blocked")
        result = {"status": "passed" if manual_status == "approved" else "blocked"}
    elif gate.get("command"):
        result = _run_command(str(gate["command"]), base, int(gate.get("timeout_min") or 10))
    else:
        result = {
            "status": "needs_agent",
            "agent": gate.get("agent"),
            "output": "gate requer execução por agente ou --status approved|blocked",
        }
    result["checked_at"] = now_iso()
    state.setdefault("gates", {})[gate_id] = result
    blocking = bool(gate.get("blocking", True))
    if blocking and result["status"] in {"failed", "blocked", "needs_agent"}:
        state["status"] = "blocked"
    save_state(state, base)
    return result


def render_plan(process: ProcessDefinition) -> str:
    payload = plan_payload(process)
    lines = [f"# Processo: {process.name}", "", process.description, ""]
    for stage in payload["stages"]:
        agent = stage["agent"]
        if isinstance(agent, dict):
            agent = ", ".join(f"{key}={value}" for key, value in agent.items())
        lines.append(
            f"- **{stage['id']}** — {stage['name']} | agente: {agent or 'manual'} "
            f"| gate: {stage['gate'] or '—'} | opcional: {stage['optional']}"
        )
    lines.append("")
    lines.append("## Gates")
    for gate in payload["gates"]:
        lines.append(
            f"- **{gate.get('id')}** — "
            f"{gate.get('command') or gate.get('agent') or 'manual'} "
            f"| blocking: {gate.get('blocking', True)}"
        )
    return "\n".join(lines)


def success_report(state: dict[str, Any]) -> str:
    lines = [
        f"# Processo concluído: {state.get('process')}",
        "",
        f"- Projeto: {state.get('project')}",
        f"- Slug: {state.get('slug')}",
        f"- Fase final: {state.get('stage_atual')}",
        "",
        "## Stages",
    ]
    for stage, value in (state.get("stages") or {}).items():
        lines.append(f"- {stage}: {value.get('status')}")
    lines.append("")
    lines.append("## Gates")
    for gate, value in (state.get("gates") or {}).items():
        lines.append(f"- {gate}: {value.get('status')}")
    return "\n".join(lines)


def partial_report(state: dict[str, Any], motivo: str, stage: str) -> str:
    return "\n".join(
        [
            f"# Processo parcial: {state.get('process')}",
            "",
            f"- Projeto: {state.get('project')}",
            f"- Slug: {state.get('slug')}",
            f"- Fase: {stage}",
            f"- Motivo: {motivo}",
            "",
            "## Stages",
            *[
                f"- {name}: {value.get('status')}"
                for name, value in (state.get("stages") or {}).items()
            ],
        ]
    )


def _print_json(payload: Any) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def _process_name_from_args(args: Any) -> str:
    return str(args.name)


def _load_or_error(args: Any) -> tuple[ProcessDefinition, dict[str, Any]]:
    definition = load_process(args.name, getattr(args, "project", None))
    state = load_state(args.name, args.slug)
    if state is None:
        raise ConfigError(
            f'State não encontrado para processo "{args.name}" e slug "{args.slug}". '
            "Use `wb process state create`."
        )
    return definition, state


def _run_list(args: Any) -> int:
    _print_json(list_processes())
    return 0


def _run_show(args: Any) -> int:
    definition = load_process(args.name, getattr(args, "project", None))
    _print_json({"name": definition.name, **definition.data, "source": str(definition.path)})
    return 0


def _run_validate(args: Any) -> int:
    names = [args.name] if args.name else [item["name"] for item in list_processes()]
    failures = 0
    for name in names:
        try:
            definition = load_process(name)
        except ConfigError as exc:
            print(f"❌ {name}: {exc}", file=sys.stderr)
            failures += 1
            continue
        errors = validate_process(definition)
        if errors:
            failures += 1
            print(f"❌ {name}:", file=sys.stderr)
            for error in errors:
                print(f"   - {error}", file=sys.stderr)
        else:
            print(f"✅ {name}")
    return 1 if failures else 0


def _run_init(args: Any) -> int:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", args.name):
        print("Nome inválido. Use lowercase, números e hífens.", file=sys.stderr)
        return 1
    target = workbench_root() / PROCESSES_DIR / args.name / "process.json"
    if target.exists() and not args.force:
        print(f"Processo já existe: {target}. Use --force para sobrescrever.", file=sys.stderr)
        return 1
    template = workbench_root() / PROCESSES_DIR / "_template" / "process.json"
    data = _read_json(template)
    data["name"] = args.name
    data["description"] = args.description or data.get("description") or f"Processo {args.name}"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"✅ Processo criado: {target}")
    return 0


def _run_plan(args: Any) -> int:
    definition = load_process(args.name, getattr(args, "project", None))
    _print_json(plan_payload(definition))
    return 0


def _run_state_create(args: Any) -> int:
    definition = load_process(args.name, getattr(args, "project", None))
    state = create_state(definition, args.slug, getattr(args, "project", None) or "workbench")
    path = save_state(state)
    _print_json({"state": state, "filePath": str(path)})
    return 0


def _run_state_load(args: Any) -> int:
    state = load_state(args.name, args.slug)
    if state is None:
        print(f'ERRO: State "{args.slug}" não encontrado para "{args.name}"', file=sys.stderr)
        return 1
    _print_json(state)
    return 0


def _run_state_resume(args: Any) -> int:
    _print_json(resume_prompt(args.name, args.slug))
    return 0


def _run_gate(args: Any) -> int:
    definition, state = _load_or_error(args)
    result = run_gate(definition, state, args.gate, manual_status=args.status)
    _print_json(result)
    return 0 if result["status"] in {"passed", "approved"} else 1


def _run_report(args: Any) -> int:
    definition, state = _load_or_error(args)
    if args.kind == "success":
        print(success_report(state))
    else:
        print(partial_report(state, args.motivo or "Interrompido", args.stage or "?"))
    return 0


def _run_schema(args: Any) -> int:
    _print_json(schema())
    return 0


def _run_status(args: Any) -> int:
    state = load_state(args.name, args.slug)
    if state is None:
        print(f'ERRO: State "{args.slug}" não encontrado para "{args.name}"', file=sys.stderr)
        return 1
    _print_json(
        {
            "process": state.get("process"),
            "slug": state.get("slug"),
            "status": state.get("status"),
            "stage_atual": state.get("stage_atual"),
            "stages": state.get("stages"),
            "gates": state.get("gates"),
        }
    )
    return 0


def _run_show_markdown(args: Any) -> int:
    definition = load_process(args.name, getattr(args, "project", None))
    print(render_plan(definition))
    return 0
