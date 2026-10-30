---
name: pr-workflow
description: Complete pull request workflow — commit changes, create PR, notify team via Teams, and optionally request code review. Compõe commit + pr + teams-pr (+ opcional: code-review).
composes:
  - commit
  - pr
  - teams-pr
  - code-review
---

# PR Workflow Pipeline

## Visão Geral

Pipeline de pull request em **3 fases sequenciais** (+ 1 opcional). A saída de cada fase alimenta a próxima.

```
Fase 1 (commit)
  └→ Commitar alterações na branch → SHA, files
      ↓
Fase 2 (pr)
  └→ Abrir Pull Request no GitHub → PR URL, number, title
      ↓
Fase 3 (teams-pr)
  └→ Notificar squad no Teams → reviewer, status
      ↓
[Opcional] Fase 4 (code-review)
  └→ Code review do PR → comentários, sugestões
      ↓
Consolidar → resumo final com PR link, status, alertas
```

## Regras de Execução para o Orquestrador

1. **Carregar** esta pipeline skill primeiro
2. Para cada fase em `## Fases`, na ordem:
   a. Carregar a skill atômica via `skill("{nome}")`
   b. Delegar via `task` com o prompt da fase (substituindo `{{placeholders}}`)
   c. Validar o JSON de retorno
   d. Se falhou e `on_failure = "abort"` → interromper pipeline e reportar erro
   e. Se falhou e `on_failure = "continue"` → registrar aviso e prosseguir
   f. Extrair os `capture_fields` do resultado e passar para a próxima fase
3. Consolidar outputs no resumo final

---

## Fases

### Phase 1 — Commit

| Propriedade | Valor |
|---|---|
| **Skill** | `commit` |
| **Entrada** | Branch name, staged changes, commit message |
| **Saída** | JSON com commit SHA, branch, files |
| **on_failure** | `abort` (sem commit não há PR) |
| **capture_fields** | `sha`, `branch`, `files[]` |

#### Prompt para Delegar

```
Use a skill commit para commitar as alterações na branch {{BRANCH}}.

Contexto:
- Branch: {{BRANCH}}
- Mensagem de commit: {{COMMIT_MESSAGE}}
- Arquivos staged: {{STAGED_FILES}}

Retorne o JSON completo conforme contrato da skill commit,
incluindo sha, branch e lista de arquivos commitados.
```

#### Validação da Fase 1

O JSON retornado DEVE conter:
- `sha` (string) — SHA do commit, não vazio
- `branch` (string) — nome da branch onde o commit foi feito

**Se `sha` estiver vazio ou commit falhar** → abortar pipeline com erro de commit.

---

### Phase 2 — Pull Request

| Propriedade | Valor |
|---|---|
| **Skill** | `pr` |
| **Entrada** | SHA do commit, branch, descrição |
| **Saída** | JSON com PR URL, number, title |
| **on_failure** | `abort` (sem PR não há o que notificar) |
| **capture_fields** | `pr_url`, `pr_number`, `pr_title` |
| **Depende de** | Phase 1 concluída com sucesso |

#### Prompt para Delegar

```
Use a skill pr para criar Pull Request no GitHub.

Contexto:
- Branch: {{PHASE1.branch}}
- Base: main
- SHA do commit: {{PHASE1.sha}}
- Título: {{PR_TITLE}}
- Descrição: {{PR_BODY}}

Retorne o JSON completo conforme contrato da skill pr,
incluindo pr_url, pr_number e pr_title.
```

#### Validação da Fase 2

O JSON retornado DEVE conter:
- `pr_url` (string) — URL válida do PR no GitHub
- `pr_number` (number) — número do PR
- `pr_title` (string) — título do PR

**Se `pr_url` não estiver presente ou for inválido** → abortar pipeline com erro de criação de PR.

---

### Phase 3 — Teams Notification

| Propriedade | Valor |
|---|---|
| **Skill** | `teams-pr` |
| **Entrada** | PR URL, number, title |
| **Saída** | JSON com status do envio |
| **on_failure** | `continue` (PR já foi criado, notificação é opcional) |
| **capture_fields** | `teams_status`, `reviewer` |
| **Depende de** | Phase 2 concluída com sucesso |

#### Prompt para Delegar

```
Use a skill teams-pr para notificar o squad sobre o PR {{PHASE2.pr_title}} (Graph API — sem fallback webhook).

Contexto:
- PR: #{{PHASE2.pr_number}}
- URL: {{PHASE2.pr_url}}
- Título: {{PHASE2.pr_title}}

Retorne o JSON completo conforme contrato da skill teams-pr,
incluindo teams_status e reviewer sorteado.
```

#### Validação da Fase 3

O JSON retornado DEVE conter:
- `teams_status` (string) — `success`, `skipped` ou `failed`
- `reviewer` (string) — nome do revisor sorteado (se aplicável)

**Se a notificação falhar, registrar aviso e prosseguir.** O PR já foi criado com sucesso.

---

### Phase 4 — Code Review (Opcional)

| Propriedade | Valor |
|---|---|
| **Skill** | `code-review` |
| **Entrada** | PR URL, number, repo |
| **Saída** | JSON com comentários, sugestões, aprovação |
| **on_failure** | `continue` (review é opcional) |
| **capture_fields** | `review_status`, `comments_count`, `approved` |
| **Depende de** | Phase 2 concluída com sucesso + **aprovação explícita do usuário** |

> **IMPORTANTE:** Esta fase **só executa se o usuário solicitar** code review.
> O orquestrador deve perguntar: "Deseja solicitar code review do PR?"

#### Prompt para Delegar

```
Use a skill code-review para revisar o PR #{{PHASE2.pr_number}}.

Contexto:
- PR: #{{PHASE2.pr_number}}
- URL: {{PHASE2.pr_url}}
- Repo: {{REPO}}
- Owner: {{OWNER}}

Retorne o JSON completo conforme contrato da skill code-review,
incluindo review_status, comentários e sugestões.
```

#### Validação da Fase 4

O JSON retornado DEVE conter:
- `review_status` (string) — `approved`, `changes_requested` ou `commented`
- `comments_count` (number) — quantidade de comentários

**Se o review falhar, registrar aviso.** O PR já foi criado e notificado.

---

## Output Consolidado

Após todas as fases, montar o resumo final:

```json
{
  "pipeline": "pr-workflow",
  "status": "success|partial|failed",
  "phases": {
    "commit": {
      "status": "success|failed",
      "sha": "abc123",
      "branch": "feat/foo",
      "files_count": 5
    },
    "pull_request": {
      "status": "success|failed",
      "pr_url": "https://github.com/owner/repo/pull/42",
      "pr_number": 42,
      "pr_title": "feat: add x"
    },
    "teams_notification": {
      "status": "success|skipped|failed",
      "reviewer": "Igor Gomes"
    },
    "code_review": {
      "status": "success|skipped|failed",
      "review_status": "approved",
      "comments_count": 3
    }
  },
  "summary": {
    "message": "PR #42 criado e squad notificado.",
    "warnings": [],
    "duration_minutes": 5
  }
}
```

## Modos de Ativação

| Modo | Exemplo de input | Fluxo |
|---|---|---|
| **Completo** | `/pr-workflow` | Fase 1 → 2 → 3 → (4 se solicitado) |
| **Sem review** | `/pr-workflow --no-review` | Fase 1 → 2 → 3 (pula Fase 4) |
| **Com review** | `/pr-workflow --review` | Fase 1 → 2 → 3 → 4 |

## Guardrails da Pipeline

1. **Phase 1 aborta se commit falhar** — sem commit não há o que enviar
2. **Phase 2 aborta se PR falhar** — sem PR não há o que notificar
3. **Phase 3 sempre continua** — notificação não é crítica, PR já existe
4. **Phase 4 só executa se usuário solicitar** — code review é opcional
5. **Nunca pular fases** — execute sempre na ordem definida
6. **Output consolidado sempre apresentado** — mesmo se fase falhar

## Cache e Repetição

- Se Phase 1 já foi executada (mesma branch, mesmo SHA), perguntar se quer re-commitar ou prosseguir
- Se Phase 2 já criou PR para a branch, informar o PR existente e perguntar se quer prosseguir para Fase 3
- Se Phase 3 já notificou, não re-notificar automaticamente (perguntar)
