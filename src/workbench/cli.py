"""CLI principal do Workbench."""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from collections.abc import Sequence

from workbench import __version__
from workbench.commands import register_all
from workbench.errors import EXIT_ERROR, EXIT_USAGE, WorkbenchError
from workbench.logging import configure, log_event, set_trace_id


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="wb",
        description="Workbench — infraestrutura de agentes, skills e automações.",
    )
    parser.add_argument("--version", action="version", version=f"workbench {__version__}")
    parser.add_argument("--json", action="store_true", help="Saída JSON no stdout.")
    parser.add_argument(
        "--log-level",
        default="info",
        choices=["debug", "info", "warn", "warning", "error"],
        help="Nível de log.",
    )
    parser.add_argument(
        "--log-format",
        default="text",
        choices=["text", "json"],
        help="Formato de log no stderr.",
    )
    parser.add_argument("--trace-id", default=None, help="ID de correlação.")

    subparsers = parser.add_subparsers(dest="command", metavar="<command>")
    register_all(subparsers)
    return parser


def _force_utf8() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")


def main(argv: Sequence[str] | None = None) -> int:
    _force_utf8()
    parser = build_parser()
    args = parser.parse_args(argv)

    configure(getattr(args, "log_level", "info"), getattr(args, "log_format", "text"))
    set_trace_id(args.trace_id or uuid.uuid4().hex[:12])

    handler = getattr(args, "handler", None)
    if handler is None:
        parser.print_help(sys.stderr)
        return EXIT_USAGE

    try:
        return int(handler(args))
    except WorkbenchError as exc:
        log_event("command.error", "error", error=exc.message, **exc.details)
        if getattr(args, "json", False):
            print(json.dumps(exc.to_dict(), ensure_ascii=False, sort_keys=True), file=sys.stderr)
        else:
            print(f"erro: {exc.message}", file=sys.stderr)
        return exc.exit_code
    except KeyboardInterrupt:
        log_event("command.interrupted", "warn")
        return 130
    except Exception as exc:  # noqa: BLE001 - fronteira da CLI
        log_event("command.unexpected", "error", error=str(exc))
        print(f"erro inesperado: {exc}", file=sys.stderr)
        return EXIT_ERROR


if __name__ == "__main__":
    sys.exit(main())
