---
description: "SPRINT completo: quality gates → branch → commit → PR → Teams. Tudo automatizado."
---

# /git-sprint

> **SPRINT flow com quality gates.** Cria branch, executa quality gates (4 camadas), commita, abre PR e notifica o time.

## Quando usar

- "sobe pra git, TASK-1234, sprint" | `/git-sprint TASK-1234`

## Escopo

> **Regras centralizadas em:** @.opencode/config/git-sprint-flow-rules.json

| Parâmetro | Valor |
|-----------|-------|
| Base | `release` |
| Branch | `feat/TASK-XXXX` |
| PRs | 1 (para `release`) |
| Commit types | `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `perf`, `style` |

**Validar branch:** `node .opencode/scripts/sprint.js validate-branch feat/TASK-1234`

---

## Fluxo de Execução

```
/git-sprint TASK-1234
├── FASE 1 — Branch Check
├── FASE 2 — Criar Branch
├── FASE 3 — Quality Gate (4 camadas)
│   ├── 🔵 Lint → ESLint/Prettier
│   ├── 🟡 SAST → Semgrep
│   ├── 🟠 Security → Trivy
│   └── 🔴 AI Review → @revisor
├── FASE 4 — Commit Flow (skill commit)
├── FASE 5 — Vault (se aplicável)
├── FASE 6 — Criar PR (skill pr)
└── FASE 7 — Teams Notification (skill teams-pr)
```

### FASE 1: Branch Check

```bash
git branch --show-current
```
Se `main`/`release` → FASE 2. Se outra → perguntar: continuar ou criar nova?

### FASE 2: Criar Branch

```bash
git checkout release && git pull origin release && git checkout -B feat/TASK-XXXX origin/release
```

### 🟢 FASE 3: Quality Gate

> **Comandos por projeto:** `node .opencode/scripts/sprint.js quality-gates <project>`
> **Árvore de decisão:** `node .opencode/scripts/sprint.js gate`

1. **🔵 Lint** — não bloqueia (`node .opencode/scripts/sprint.js quality-gates <project>` → `.lint`)
2. **🟡 SAST** — bloqueia se ERROR
3. **🟠 Security** — não bloqueia (sprint)
4. **🔴 AI Review** — delegar @revisor (git diff)

| Resultado | Ação |
|-----------|------|
| ✅ Todas OK | Avança |
| ⚠️ Issues leves (P2, WARNING) | Avança, registra |
| 🔴 Issues GRAVES (P0/P1, ERROR) | Pausa — pergunta |

### FASE 4: Commit

Carregar skill `commit` (`@.opencode/skills/commit`) com: `task=TASK-XXXX`, `branch=feat/TASK-XXXX`, `type=feat`

### FASE 5: Vault

Se houver mudanças estruturais → delegar @vault-updater.

### FASE 6: PR

Carregar skill `pr` (`@.opencode/skills/pr`) com: `base=release`, `head=feat/TASK-XXXX`, `task=TASK-XXXX`, `type=sprint`

### FASE 7: Teams

> ⚠️ Teams Guard-Rail: nunca sem aprovação explícita.

Perguntar: "Notificar time?" Se sim → skill `teams-pr` com `TASK-XXXX`.

---

## Relatório Final

```
SPRINT TASK-XXXX — Relatório
├── Branch:  feat/TASK-XXXX
├── Quality: ✅ (🔵 🟡 🟠 🔴)
├── Commit:  ✅
├── PR:      {URL}
└── Teams:   ✅/❌
```
