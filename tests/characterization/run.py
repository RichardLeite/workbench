#!/usr/bin/env python
"""Harness de caracterização Node -> Python.

Uso:
  python tests/characterization/run.py capture
  python tests/characterization/run.py check --impl node
  python tests/characterization/run.py check --impl python

Os golden files ficam em ``tests/golden/<id>.json``.
"""

from __future__ import annotations

import argparse
import difflib
import json
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = Path(__file__).resolve().parent / "manifest.json"
GOLDEN_DIR = ROOT / "tests" / "golden"

for _stream in (sys.stdout, sys.stderr):
    _reconfigure = getattr(_stream, "reconfigure", None)
    if _reconfigure is not None:
        _reconfigure(encoding="utf-8", errors="replace")


def load_manifest() -> dict[str, Any]:
    with MANIFEST.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalize(text: str) -> str:
    root = str(ROOT.resolve())
    text = text.replace(root, "<ROOT>")
    text = text.replace(root.replace("\\", "/"), "<ROOT>")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in text.splitlines()]
    return "\n".join(lines).rstrip("\n")


def argv_for(case: dict[str, Any], impl: str) -> list[str] | None:
    if impl == "node":
        return list(case["argv"])
    python_argv = case.get("python_argv")
    if not python_argv:
        return None
    return [sys.executable if item == "{python}" else item for item in python_argv]


def run_case(case: dict[str, Any], impl: str) -> dict[str, Any]:
    argv = argv_for(case, impl)
    if argv is None:
        raise RuntimeError(f"caso {case['id']} não define python_argv")

    started = time.perf_counter()
    completed = subprocess.run(
        argv,
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=case.get("timeout", 60),
        shell=False,
    )
    elapsed = round((time.perf_counter() - started) * 1000, 2)
    return {
        "id": case["id"],
        "implementation": impl,
        "argv": argv,
        "returncode": completed.returncode,
        "stdout": normalize(completed.stdout or ""),
        "stderr": normalize(completed.stderr or ""),
        "duration_ms": elapsed,
        "captured_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }


def golden_path(case_id: str) -> Path:
    return GOLDEN_DIR / f"{case_id}.json"


def capture(cases: list[dict[str, Any]], only: set[str] | None) -> int:
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
    failures = 0
    for case in cases:
        if only and case["id"] not in only:
            continue
        try:
            result = run_case(case, "node")
        except Exception as exc:  # noqa: BLE001 - harness de migração
            print(f"[FAIL] {case['id']}: {exc}")
            failures += 1
            continue
        path = golden_path(case["id"])
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        status = "ok" if result["returncode"] == 0 else f"exit {result['returncode']}"
        print(f"[CAPTURE] {case['id']} ({status}) -> {path.relative_to(ROOT)}")
    return 1 if failures else 0


def check(cases: list[dict[str, Any]], impl: str, only: set[str] | None) -> int:
    failures = 0
    skipped = 0
    for case in cases:
        if only and case["id"] not in only:
            continue
        if argv_for(case, impl) is None:
            skipped += 1
            print(f"[SKIP] {case['id']} (sem {impl}_argv)")
            continue

        path = golden_path(case["id"])
        if not path.is_file():
            print(f"[FAIL] {case['id']}: golden ausente ({path.relative_to(ROOT)})")
            failures += 1
            continue

        expected = json.loads(path.read_text(encoding="utf-8"))
        actual = run_case(case, impl)
        problems = []
        if expected["returncode"] != actual["returncode"]:
            problems.append(f"returncode {expected['returncode']} != {actual['returncode']}")
        for stream in ("stdout", "stderr"):
            if expected[stream] != actual[stream]:
                diff = "".join(
                    difflib.unified_diff(
                        expected[stream].splitlines(keepends=True),
                        actual[stream].splitlines(keepends=True),
                        fromfile=f"golden/{case['id']}.{stream}",
                        tofile=f"{impl}/{case['id']}.{stream}",
                    )
                )
                problems.append(f"{stream} divergente:\n{diff}")

        if problems:
            failures += 1
            print(f"[FAIL] {case['id']}\n" + "\n".join(problems))
        else:
            print(f"[ OK ] {case['id']}")

    if skipped:
        print(f"{skipped} caso(s) sem implementação {impl}.")
    return 1 if failures else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Harness de caracterização do Workbench")
    subparsers = parser.add_subparsers(dest="mode", required=True)
    capture_parser = subparsers.add_parser(
        "capture", help="Captura a saída dos scripts Node atuais"
    )
    capture_parser.add_argument("--only", action="append", default=[])
    check_parser = subparsers.add_parser(
        "check", help="Compara uma implementação com os golden files"
    )
    check_parser.add_argument("--impl", choices=["node", "python"], default="python")
    check_parser.add_argument("--only", action="append", default=[])
    args = parser.parse_args(argv)

    cases = load_manifest()["cases"]
    only = set(args.only) if args.only else None
    if args.mode == "capture":
        return capture(cases, only)
    return check(cases, args.impl, only)


if __name__ == "__main__":
    sys.exit(main())
