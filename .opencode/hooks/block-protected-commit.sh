#!/usr/bin/env bash
# PreToolUse(Bash) hook — bloqueia `git commit` quando a branch atual é protegida.
#
# Por que um hook e não uma regra de permissão:
#   `git commit` não recebe a branch como argumento — a branch é estado da sessão,
#   não faz parte da string do comando. Nenhum padrão `Bash(...)` consegue expressar
#   "commit enquanto estiver em main". Regras como `Bash(git commit:* main)` são
#   sintaticamente inválidas e, mesmo corrigidas (`git commit * main`), nunca casam.
#   Ver: .opencode/rules/constitution.md (regra 1).
#
# Escopo (deliberadamente estreito):
#   - Bloqueia SOMENTE segmentos que COMEÇAM com `git ... commit`.
#   - Qualquer outro comando Bash em main/release passa sem interferência.
#   - `git commit --dry-run` passa (não cria commit).
#
# Invocação (sem depender de bit de execução — repo em /mnt/f):
#   bash .opencode/hooks/block-protected-commit.sh
#
# Contrato: payload JSON em stdin; exit 0 = permite, exit 2 = bloqueia (stderr → Claude).

set -uo pipefail

PROTECTED_BRANCHES='main release'

payload=$(cat)

# ── Extrai tool_input.command do JSON sem jq/python (honra escapes \" \\ \n) ──
extract_command() {
  local s=$1 rest out='' i=0 n c d
  rest=${s#*'"command":'}
  [ "$rest" = "$s" ] && return 1                     # chave ausente
  rest=${rest#"${rest%%[![:space:]]*}"}              # remove espaços à esquerda
  [ "${rest:0:1}" = '"' ] || return 1
  rest=${rest:1}
  n=${#rest}
  while [ "$i" -lt "$n" ]; do
    c=${rest:$i:1}
    if [ "$c" = '\' ]; then
      d=${rest:$((i + 1)):1}
      case $d in
        n) out+=$'\n' ;;
        t) out+=$'\t' ;;
        r) out+=$'\r' ;;
        u) out+=' '; i=$((i + 4)) ;;                 # \uXXXX → espaço (irrelevante p/ match)
        *) out+=$d ;;                                # \" \\ \/ e afins
      esac
      i=$((i + 2))
      continue
    fi
    [ "$c" = '"' ] && break                          # fim da string JSON
    out+=$c
    i=$((i + 1))
  done
  printf '%s' "$out"
}

command_line=$(extract_command "$payload") || exit 0
[ -n "$command_line" ] || exit 0

# ── Detecta `git commit` real ────────────────────────────────────────────────
# Quebra em segmentos (; && || | e newline) e exige que o segmento COMECE com git.
# Ancorar no início evita falso positivo em `echo "rode git commit"`.
GIT_COMMIT_RE='^[[:space:]]*[({]?[[:space:]]*git([[:space:]]+(-C[[:space:]]+[^[:space:]]+|-c[[:space:]]+[^[:space:]]+|--git-dir=[^[:space:]]+|--work-tree=[^[:space:]]+))*[[:space:]]+commit([[:space:]]|$)'

segments=$(printf '%s' "$command_line" | tr ';\n' '\n\n' | sed 's/&&/\n/g; s/||/\n/g; s/|/\n/g')

printf '%s\n' "$segments" | grep -Eq "$GIT_COMMIT_RE" || exit 0

# `--dry-run` não cria commit → permite.
if printf '%s\n' "$segments" | grep -E "$GIT_COMMIT_RE" | grep -q -- '--dry-run'; then
  exit 0
fi

# ── Branch atual ─────────────────────────────────────────────────────────────
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0   # não é repo git → não opina
[ -n "$branch" ] || exit 0
[ "$branch" = "HEAD" ] && exit 0                                  # detached HEAD → não opina

for protected in $PROTECTED_BRANCHES; do
  if [ "$branch" = "$protected" ]; then
    cat >&2 <<EOF
BLOQUEADO: commit direto na branch protegida '$branch'.

Regra: .opencode/rules/constitution.md (regra 1) — nunca commitar em main/release.
Comando: $command_line

Faça: crie uma branch (git checkout -b <tipo>/<escopo>), commite nela e abra PR.
EOF
    exit 2
  fi
done

exit 0
