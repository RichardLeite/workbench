#!/usr/bin/env sh
set -u

if [ "${WB_NO_DISCOVERY:-0}" = "1" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$ROOT" ]; then
  ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
fi

WB_ROOT="$ROOT" sh "$ROOT/scripts/wb" projects sync --quiet --root "$ROOT" >/dev/null 2>&1 || true
