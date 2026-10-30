"""CLI do motor de processos composÃ¡veis."""

from __future__ import annotations

from argparse import ArgumentParser, _SubParsersAction

from workbench import process_engine as engine


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser(
        "process",
        help="Processos composÃ¡veis: listar, validar, planejar e executar gates.",
    )
    parser.add_argument("--json", action="store_true", help="Reservado para saÃ­da JSON.")
    process_sub = parser.add_subparsers(dest="process_command", required=True)

    list_command = process_sub.add_parser("list", help="Lista processos disponíveis.")
    list_command.add_argument("--project", default=None)
    list_command.set_defaults(handler=engine._run_list)
    process_sub.add_parser("schema", help="Mostra o JSON Schema de processo.").set_defaults(
        handler=engine._run_schema
    )

    show = process_sub.add_parser("show", help="Mostra um processo.")
    show.add_argument("name")
    show.add_argument("--project", default=None)
    show.set_defaults(handler=engine._run_show)

    validate = process_sub.add_parser("validate", help="Valida um ou todos os processos.")
    validate.add_argument("name", nargs="?", default=None)
    validate.add_argument("--project", default=None)
    validate.set_defaults(handler=engine._run_validate)

    init = process_sub.add_parser("init", help="Cria um processo a partir do template.")
    init.add_argument("name")
    init.add_argument("--description", default=None)
    init.add_argument("--force", action="store_true")
    init.set_defaults(handler=engine._run_init)

    plan = process_sub.add_parser("plan", help="Gera o plano do processo.")
    plan.add_argument("name")
    plan.add_argument("--project", default=None)
    plan.set_defaults(handler=engine._run_plan)

    state = process_sub.add_parser("state", help="Gerencia o estado do processo.")
    state_sub = state.add_subparsers(dest="state_command", required=True)
    create = state_sub.add_parser("create", help="Cria um estado.")
    create.add_argument("name")
    create.add_argument("slug")
    create.add_argument("--project", default=None)
    create.set_defaults(handler=engine._run_state_create)
    load = state_sub.add_parser("load", help="Carrega um estado.")
    load.add_argument("name")
    load.add_argument("slug")
    load.set_defaults(handler=engine._run_state_load)
    resume = state_sub.add_parser("resume", help="Verifica retomada.")
    resume.add_argument("name")
    resume.add_argument("slug")
    resume.set_defaults(handler=engine._run_state_resume)

    status = process_sub.add_parser("status", help="Mostra o status resumido.")
    status.add_argument("name")
    status.add_argument("slug")
    status.set_defaults(handler=engine._run_status)

    gate = process_sub.add_parser("gate", help="Executa ou registra um gate.")
    gate.add_argument("name")
    gate.add_argument("gate")
    gate.add_argument("--slug", required=True)
    gate.add_argument("--status", choices=["approved", "blocked"], default=None)
    gate.add_argument("--project", default=None)
    gate.set_defaults(handler=engine._run_gate)

    report = process_sub.add_parser("report", help="Gera relatÃ³rio do processo.")
    report.add_argument("name")
    report.add_argument("slug")
    report.add_argument("kind", choices=["success", "partial"])
    report.add_argument("--motivo", default=None)
    report.add_argument("--stage", default=None)
    report.set_defaults(handler=engine._run_report)
