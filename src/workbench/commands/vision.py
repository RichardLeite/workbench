"""CLI de utilitários de imagem/visão."""

from __future__ import annotations

import json
import sys
from argparse import ArgumentParser, Namespace, _SubParsersAction
from pathlib import Path

from workbench import vision


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser("vision", help="Utilitários de imagem/visão.")
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    vision_sub = parser.add_subparsers(dest="vision_command", required=True)
    probe = vision_sub.add_parser("probe", help="Valida um arquivo de imagem.")
    probe.add_argument("path")
    probe.set_defaults(handler=_run_probe)
    error = vision_sub.add_parser("check-error", help="Detecta erro de visão em um texto.")
    error.add_argument("text")
    error.set_defaults(handler=_run_check_error)


def _run_probe(args: Namespace) -> int:
    resolved = Path(args.path).resolve()
    if not resolved.is_file():
        print(f"Error: file not found: {resolved}", file=sys.stderr)
        return 3
    try:
        buffer = resolved.read_bytes()
        result = vision.validate_magic_header(buffer)
        vision.assert_size_cap(buffer)
        print(
            json.dumps(
                {"ok": result["ok"], "mime": result["mime"], "size": len(buffer)},
                ensure_ascii=False,
                separators=(",", ":"),
            )
        )
        return 0
    except Exception as exc:  # noqa: BLE001 - contrato de exit codes do CLI
        message = str(exc)
        if message.startswith("MIME_INVALID"):
            print(message, file=sys.stderr)
            return 2
        if message.startswith("SOURCE_INVALID"):
            print(message, file=sys.stderr)
            return 3
        if message.startswith("SIZE_EXCEEDED"):
            print(message, file=sys.stderr)
            return 4
        print(message, file=sys.stderr)
        return 1


def _run_check_error(args: Namespace) -> int:
    matched = [
        pattern.pattern for pattern in vision.VISION_ERROR_PATTERNS if pattern.search(args.text)
    ]
    print(
        json.dumps(
            {"is_error": bool(matched), "matched_patterns": matched},
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0
