---
description: "HOTFIX completo: quality gates → 2 branches → commit → 2 PRs → Teams. Escopo mínimo, qualidade máxima."
---

# /git-hotfix

> **HOTFIX flow com quality gates.** Correção urgente com revisão de segurança, 2 PRs (main + release) e notificação do time.

## Quando usar

- "sobe pra git, TASK-0001, hotfix" | `/git-hotfix TASK-0001`

## Escopo

> **Regras centralizadas em:** @.opencode/config/git-hotfix-flow-rules.json
> **Validação de branches:** `uv run --frozen python -m workbench hotfix validate-branch <branch>` / `validate-release <branch>` / `validate-cherry-pick <main> -- <release>` / `validate-pr-count <n>`

| Parâmetro | Valor |
|-----------|-------|
| Branch main | `fix/TASK-XXXX` |
| Branch release | `fix/TASK-XXXX-release` |
| PRs | 2 (main + release) |
| Commit types | `fix`, `feat`, `chore`, `refactor`, `test`, `docs`, `perf` |

**Validar branches:**
- `uv run --frozen python -m workbench hotfix validate-branch fix/TASK-1234`
- `uv run --frozen python -m workbench hotfix validate-release fix/TASK-1234-release`

---

## Fluxo de Execução

```
/git-hotfix TASK-0001
├── FASE 1 — Branch Check
├── STAGE 1: MAIN
│   ├── FASE 2 — Branch (fix/TASK-XXXX from main)
│   ├── 🟢 FASE 3 — Quality Gate (foco segurança)
│   ├── FASE 4 — Commit Flow
│   └── FASE 5 — PR para main
├── STAGE 2: RELEASE
│   ├── FASE 6 — Branch (fix/TASK-XXXX-release from release)
│   ├── FASE 7 — Cherry-pick
│   └── FASE 8 — PR para release
└── STAGE 3: FINALIZAÇÃO
    ├── FASE 9 — Vault
    └── FASE 10 — Teams
```

### FASE 1: Branch Check

```bash
git branch --show-current
```
Se `main`/`release` → criar. Se outra → perguntar.

---

## STAGE 1: PR para MAIN

### FASE 2 — Branch

```bash
git checkout main && git pull origin main && git checkout -B fix/TASK-XXXX origin/main
```

### 🟢 FASE 3 — Quality Gate

> **Foco em segurança.** Lint não bloqueia. Security CRITICAL bloqueia.

> **Comandos:** `uv run --frozen python -m workbench hotfix quality-gates <project>`
> **Decisão:** `uv run --frozen python -m workbench hotfix gate`

```bash
# 🔵 Lint — não bloqueia
# 🟡 SAST — bloqueia se ERROR
# 🟠 Security — CRITICAL BLOQUEIA
# 🔴 AI Review — bloqueia se P0
```

Delegar @revisor: revisar diff (`git diff main`). Critérios: resolve? segurança? escopo mínimo? rollback?

### FASE 4 — Commit

Carregar skill `commit` (`@.opencode/skills/commit`) com: `task=TASK-XXXX`, `branch=fix/TASK-XXXX`, `type=fix`

### FASE 5 — PR para main

Carregar skill `pr` (`@.opencode/skills/pr`) com: `base=main`, `head=fix/TASK-XXXX`, `task=TASK-XXXX`, `type=hotfix`, `stage=main`

---

## STAGE 2: PR para RELEASE

### FASE 6 — Branch

```bash
git checkout release && git pull origin release && git checkout -B fix/TASK-XXXX-release origin/release
```

### FASE 7 — Cherry-pick

```bash
git cherry-pick <commit-hash-1> <commit-hash-2>
```
**Validar:** `uv run --frozen python -m workbench hotfix validate-cherry-pick <mainSHAs> -- <releaseSHAs>`

> ⚠️ CONFLITOS: nunca resolver automaticamente. Perguntar ao usuário.

### FASE 8 — PR para release

Carregar skill `pr` (`@.opencode/skills/pr`) com: `base=release`, `head=fix/TASK-XXXX-release`, `task=TASK-XXXX`, `type=hotfix`, `stage=release`

---

## STAGE 3: FINALIZAÇÃO

### FASE 9 — Vault

Se alterou regras/fluxos → delegar @vault-updater.

### FASE 10 — Teams

> ⚠️ Teams Guard-Rail: nunca sem aprovação explícita.

Perguntar: "Notificar time (🔥 hotfix)?" Se sim → skill `teams-pr` com `TASK-XXXX --type hotfix`.

---

## Relatório Final

```
HOTFIX TASK-XXXX — Relatório
├── STAGE 1 (main):       fix/TASK-XXXX → PR {URL}
│   ├── Quality Gate:     ✅ (🟡 🟠 🔴)
│   └── Commit:           ✅
├── STAGE 2 (release):    fix/TASK-XXXX-release → PR {URL}
│   ├── Cherry-pick:      ✅
│   └── Commit:           ✅
└── Teams:                ✅/❌
```
