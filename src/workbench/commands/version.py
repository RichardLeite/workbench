"""Comando ``wb version``."""

from __future__ import annotations

import json
import platform
import sys
from argparse import ArgumentParser, Namespace, _SubParsersAction

from workbench import __version__


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser(
        "version",
        help="Mostra a versão do Workbench e do Python.",
    )
    parser.add_argument("--json", action="store_true", help="Saída JSON no stdout.")
    parser.set_defaults(handler=run)


def run(args: Namespace) -> int:
    payload = {
        "name": "workbench",
        "version": __version__,
        "python": platform.python_version(),
        "python_executable": sys.executable,
        "platform": platform.platform(),
    }
    if getattr(args, "json", False):
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    else:
        print(f"workbench {__version__}")
        print(f"python {payload['python']} ({payload['python_executable']})")
        print(payload["platform"])
    return 0
