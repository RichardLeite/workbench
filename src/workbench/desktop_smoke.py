"""Smoke checks for OpenCode Desktop startup logs."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

SCHEMA_ERROR = re.compile(
    r"\bschema rejection\b|\bExpected ConfigV2\b|\bConfigInvalidError\b",
    re.I,
)
AGENT_ERROR = re.compile(r"\bduplicate agent\b", re.I)


def check_log(text: str) -> list[str]:
    """Return log lines that indicate a Desktop startup failure."""
    return [
        line.strip()
        for line in text.splitlines()
        if SCHEMA_ERROR.search(line) or AGENT_ERROR.search(line)
    ]


def read_log_since(path: Path, offset: int) -> str:
    """Read only bytes appended to a log after the given offset."""
    if not path.is_file():
        return ""
    try:
        size = path.stat().st_size
        if offset > size:
            offset = 0
        with path.open("rb") as handle:
            handle.seek(offset)
            return handle.read().decode("utf-8", errors="replace")
    except OSError:
        return ""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check an OpenCode Desktop startup log.")
    parser.add_argument("--log", required=True, type=Path)
    parser.add_argument("--since", default=0, type=int, help="Read the log from this byte offset.")
    args = parser.parse_args(argv)

    issues = check_log(read_log_since(args.log, args.since))
    if issues:
        for issue in issues:
            print(issue)
        return 1
    print("desktop smoke: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
