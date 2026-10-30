#!/usr/bin/env sh
# Bootstrap Python do Workbench (Linux/macOS).
# Detecta Python 3.11+, instala via uv se necessário e executa `python -m workbench`.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
MIN_VERSION=${WB_PYTHON_VERSION:-3.11}
VENV="$ROOT/.venv"
LOG_PREFIX="[workbench/bootstrap]"

log() { printf '%s %s\n' "$LOG_PREFIX" "$*" >&2; }
fail() { log "ERRO: $*"; exit 3; }

python_ok() {
  "$@" -c 'import sys; sys.exit(0 if sys.version_info[:2] >= (3, 11) else 1)' >/dev/null 2>&1
}

find_python() {
  for candidate in python3 python python3.11 python3.12 python3.13 python3.14; do
    if command -v "$candidate" >/dev/null 2>&1 && python_ok "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

ensure_uv() {
  if command -v uv >/dev/null 2>&1; then
    return 0
  fi
  if [ "${WB_NO_INSTALL:-0}" = "1" ]; then
    fail "uv não encontrado e WB_NO_INSTALL=1"
  fi
  log "uv não encontrado; instalando via instalador oficial..."
  if command -v curl >/dev/null 2>&1; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- https://astral.sh/uv/install.sh | sh
  else
    fail "curl/wget indisponível para instalar uv"
  fi
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
  command -v uv >/dev/null 2>&1 || fail "uv não está no PATH após instalação"
}

PYTHON=""
if [ -x "$VENV/bin/python" ] && python_ok "$VENV/bin/python"; then
  PYTHON="$VENV/bin/python"
fi
if [ -z "${PYTHON:-}" ] && [ -n "${WB_PYTHON:-}" ]; then
  python_ok "$WB_PYTHON" || fail "WB_PYTHON não é um Python >= 3.11: $WB_PYTHON"
  PYTHON="$WB_PYTHON"
fi
if [ -z "${PYTHON:-}" ]; then
  PYTHON=$(find_python || true)
fi

if [ -z "${PYTHON:-}" ]; then
  log "Python >= ${MIN_VERSION} não encontrado."
  ensure_uv
  log "Instalando Python ${MIN_VERSION} via uv..."
  uv python install "$MIN_VERSION" || fail "falha ao instalar Python ${MIN_VERSION}"
  PYTHON=$(uv python find --managed-python "$MIN_VERSION" 2>/dev/null \
    || uv python find --system "$MIN_VERSION" 2>/dev/null || true)
  [ -n "${PYTHON:-}" ] || fail "não foi possível localizar Python ${MIN_VERSION} após instalação"
fi

log "Usando Python: $PYTHON"

if [ ! -x "$VENV/bin/python" ]; then
  log "Criando venv em $VENV..."
  if command -v uv >/dev/null 2>&1; then
    uv venv --python "$PYTHON" "$VENV"
  else
    "$PYTHON" -m venv "$VENV"
  fi
fi

if command -v uv >/dev/null 2>&1; then
  log "Sincronizando dependências..."
  (cd "$ROOT" && (uv sync --frozen 2>/dev/null || uv sync)) || fail "uv sync falhou"
fi

export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8
exec "$VENV/bin/python" -m workbench "$@"
