---
name: sprint-pipeline
description: Sprint planning: read Azure PBIs → guard-rail (skip if has child tasks) → classify impact → create 7 child tasks (FE/BE/DB/Owner/Testing/PM/CR) with OE, RW, Activity, Worked Time. Compõe planning-analysis + planning-setup.
composes:
  - planning-analysis
  - planning-setup
---

# Sprint Pipeline

## Visão Geral

Pipeline de planejamento de sprint em **4 etapas sequenciais**:

```
Etapa 0 (Iterative Discovery)
  └→ Listar sprints → ordenar por data → mostrar 4 mais próximas → usuário escolhe
      ↓
Guard-rail (pre-flight)
  └→ Verificar se PBI já tem child tasks → se sim, SKIP
      ↓
Fase 1 (planning-analysis)
  └→ Analisar PBI/Bug → classificar impacto (FE/BE/DB — condicionais) → estimar horas realistas
      ↓
Fase 2 (planning-setup)
  └→ Criar 4 tasks fixas (Code Review + Task Owner + PM Validation + Testing) + tasks condicionais conforme Fase 1
      ↓
Consolidar → resumo final com links, totais, alertas
```

## Etapa 0 — Iterative Sprint Discovery

**Objetivo:** O usuário não precisa saber o nome exato da sprint. O sistema descobre e oferece as opções.

**Fluxo:**
1. Chamar `mcp_ado_work_list_team_iterations({ project, team })` para listar todas as iterações do time
2. Filtrar por `timeFrame === "current"` ou `"future"` (sprints atuais e futuras)
3. Ordenar por `attributes.startDate` decrescente (mais recente primeiro)
4. Selecionar as **4 sprints mais próximas** (corrente + próximas 3)
5. Apresentar ao usuário em formato tabular:

   ```
   📅 Sprints disponíveis:
   # | Nome                        | Início       | Fim          | 
   1 | Sprint 07-2026              | 29/06/2026   | 10/07/2026   | ← Atual
   2 | Sprint 08-2026              | 13/07/2026   | 24/07/2026   |
   3 | Sprint 09-2026              | 27/07/2026   | 07/08/2026   |
   4 | Sprint 10-2026              | 10/08/2026   | 21/08/2026   |
   ```

6. Perguntar: "Which sprint do you want to plan?" com as 4 opções
7. Usuário também pode informar um PBI ID específico diretamente

---

### Estrutura de tasks por PBI (4 fixas + até 3 condicionais)

> **Dados completos:** `uv run --frozen python -m workbench sprint definitions`
> **Regras de negócio (R1-R6):** @.opencode/backlog/adr/ADR-004-sprint-tasks.md (R4)

| # | Tipo | Tasks | OE | RW | WorkedTime |
|:-:|------|-------|:--:|:--:|:----------:|
| 1-3 | **Condicionais** (criar só se houver evidência) | Frontend, Backend, Database | — | — | 0 |
| 4-7 | **Fixas** (sempre criadas) | Code Review, Task Owner, PM Validation, Testing — {scope} | 1-2h | = OE | 0 |

> Database é **SEMPRE 1 task única** — nunca quebrar em migration + seed.

**Como escrever acceptance criteria como PO Senior:**

| Faça ✅ | Não faça ❌ |
|---------|------------|
| "O sistema deve exibir mensagem de confirmação após salvar" | "Criar modal de sucesso" |
| "A busca deve retornar resultados em até 3s para até 10k registros" | "Fazer busca rápida" |
| "O campo CPF deve aceitar apenas ###.###.###-## e exibir erro visual se inválido" | "Validar CPF no input" |
| "Ao clicar em 'Cancelar', o formulário deve ser fechado sem salvar dados parciais" | "Botão cancelar" |
| Usar Gherkin para cenários complexos: `Dado... Quando... Então...` | Lista técnica de implementação |

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

### Phase 1 — Planning Analysis

| Propriedade | Valor |
|---|---|
| **Skill** | `planning-analysis` |
| **Entrada** | PBI/Bug ID, sprint name, ou descrição livre |
| **Saída** | JSON com cards (condicionais), links Azure |
| **on_failure** | `abort` (sem análise não há setup) |
| **capture_fields** | `work_item_id`, `cards[].title`, `azure_links[]` |

#### Prompt para Delegar

```
Use a skill planning-analysis para analisar {{INPUT}}.

Contexto:
- Modo: {{MODE}} (work_item_id | sprint_name | free_form)
- Projeto: {{PROJECT}} (resolvido via `uv run --frozen python -m workbench ado resolve`)
- Time: {{TEAM}} (resolvido via `uv run --frozen python -m workbench ado resolve`)

Requisitos obrigatórios:
1. **Guard-rail**: Antes de criar tasks, verificar se o PBI já tem child tasks. Se tiver 1+ → SKIP (não criar nada).
2. @.opencode/backlog/adr/ADR-004-sprint-tasks.md (R4)
3. Para cada PBI sem child tasks, gerar tasks conforme a estrutura **4 fixas + até 3 condicionais** (dados em `sprint.js`):
   > `uv run --frozen python -m workbench sprint definitions`
   >
   > **Tasks fixas (4):** Code Review (OE=1h), Task Owner (OE=1h), PM Validation (OE=1h), Testing — {scope} (OE=2-6h)
   > **Tasks condicionais (até 3):** Frontend, Backend, Database — OE e RW vazios, apenas WorkedTime=0
   > **Database SEMPRE 1 task única**, nunca quebrar em 2

4. **WorkedTime = 0** em TODAS as tasks (fixas e condicionais). Sempre.
4a. **Campos fixos** das tasks fixas: OE=RW padronizados conforme sprint-rules.json.
4b. **Database — SEMPRE 1 task única**, nunca quebrar em 2.
4c. **Tasks condicionais SEM OE/RW** — apenas Activity e WorkedTime=0.
4d. **Sinais para criar tasks condicionais** (usar sinais fortes do título/descrição da PBI):
   - **Frontend:** modal, screen, tab, form, button, alert, visual, click, display, layout, table, dropdown
   - **Backend:** endpoint, job, email, export, integration, calculation rule, validation, serialization, report, scheduled job, fallback, default
   - **Database:** column, table, migration, relationship, unique, backfill, index, key, type, default value, constraint
   - Se NÃO houver evidência, NÃO criar a task (não presumir).

Retorne o JSON completo conforme contrato da skill planning-analysis,
incluindo cards, estimativas, azure_links e ação realizada em cada card.
```

#### Validação da Fase 1

O JSON retornado DEVE conter:
- `work_item_id` (number) — ID do PBI/Bug analisado
- `cards` (array) — pelo menos 1 card
- `preflight.mcp_tool_test` (boolean) — `true` se MCP estava OK

**Se `preflight.mcp_tool_test = false`** → abortar pipeline com erro de conexão Azure.

---

### Phase 2 — Planning Setup

| Propriedade | Valor |
|---|---|
| **Skill** | `planning-setup` |
| **Entrada** | Mesmo PBI/Bug da Fase 1 (ou sprint inteiro) |
| **Saída** | JSON com tasks criadas/skipped |
| **on_failure** | `continue` (setup padrão é opcional, análise já foi feita) |
| **capture_fields** | `results[].tasks_created[]`, `results[].tasks_skipped_existing[]`, `summary` |
| **Depende de** | Phase 1 concluída com sucesso |

#### Prompt para Delegar

```
Use a skill planning-setup para configurar as **4 tasks fixas** do(s) PBI(s) analisado(s) (Code Review, Task Owner, PM Validation, Testing — {scope}). As tasks condicionais (FE/BE/DB) já foram criadas na Fase 1 pela planning-analysis.

Contexto:
- PBI ID: {{PHASE1.work_item_id}}
- Cards criados na Fase 1: {{PHASE1.cards[].title}}
- Sprint: {{SPRINT_NAME}} (se aplicável)

Requisitos obrigatórios:
1. **Guard-rail**: Se o PBI já tem 1+ child tasks → SKIP completamente
2. Criar tasks conforme a estrutura **4 fixas + até 3 condicionais** (dados em `sprint.js`):
   > `uv run --frozen python -m workbench sprint definitions`
   >
   > **Tasks fixas (4):** Code Review, Task Owner, PM Validation, Testing — {scope}
   > **Tasks condicionais (até 3):** Frontend, Backend, Database
   > **Database SEMPRE 1 task única**, nunca quebrar em 2

3. **WorkedTime = 0** em TODAS as tasks (fixas e condicionais). Sempre.
4. @.opencode/backlog/adr/ADR-004-sprint-tasks.md (R4)
5. Task Owner: HTML fixo com responsabilidades + contrato request/response
6. PM Validation: formato Markdown com checklist - [ ] clicável
7. Testing: ACs como PO Senior — descrever cenários de teste específicos, não genéricos ("Testes funcionais")
8. **Tasks condicionais SEM OE/RW** — apenas Activity e WorkedTime=0.

Retorne o JSON completo conforme contrato da skill planning-setup.
```

#### Validação da Fase 2

O JSON retornado DEVE conter:
- `results` (array) — resultados por PBI processado
- `summary` (object) — totais de tasks criadas/skipped

**Se a Fase 1 analisou múltiplos PBIs (modo sprint), a Fase 2 processa todos.**

---

## Output Consolidado

Após ambas as fases, montar o resumo final:

```json
{
  "pipeline": "sprint-pipeline",
  "status": "success|partial|failed",
  "phases": {
    "planning_analysis": {
      "status": "success|failed",
      "work_item_id": 19379,
      "cards_count": 3,
      "azure_links": ["https://..."]
    },
    "planning_setup": {
      "status": "success|skipped|failed",
      "tasks_created": 42,
      "tasks_skipped": 36,
      "pbis_fully_setup": 12,
      "pbis_partial": 3
    }
  },
  "summary": {
    "message": "Sprint planejada com sucesso. 3 cards criados, 42 tasks padrão configuradas.",
    "warnings": ["Fase 2 continuou apesar de 3 PBIs parciais"],
    "duration_minutes": 12
  }
}
```

## Modos de Ativação

| Modo | Exemplo de input | Fluxo |
|---|---|---|
| **PBI único** | `WI 19379` | Fase 1 analisa 1 PBI → Fase 2 setup nesse PBI |
| **Sprint completo** | `Sprint 05-2026` | Fase 1 analisa todos PBIs do sprint → Fase 2 setup em todos |
| **Descrição livre** | `[texto da demanda]` | Fase 1 analisa sem Azure → Fase 2 pula (sem PBI no Azure) |

## Guardrails da Pipeline

1. **Guard-rail #0 (Iterative discovery)** — Sempre listar sprints primeiro. Nunca assumir que o usuário sabe o nome da sprint.
2. **Guard-rail #1 (PBI com tasks)** — Se PBI já tem 1+ child tasks, SKIP completo. Não criar nem perguntar.
3. **Guard-rail #2** — @.opencode/backlog/adr/ADR-004-sprint-tasks.md (R4)
4. **Guard-rail #3 (4 fixas + até 3 condicionais)** — Sempre criar as 4 tasks fixas (Code Review, Task Owner, PM Validation, Testing — {scope}). As tasks de development (Frontend, Backend, Database) são **condicionais**: criar APENAS quando houver evidência clara no escopo da PBI. Nunca presumir; nunca criar task vazia; nunca criar Database sem migration/índice/seed.
5. **Guard-rail #4 (Activity obrigatório)** — Toda task deve ter Activity preenchido: Development | Design | Testing.
6. **Guard-rail #5 (Worked Time = 0)** — WorkedTime sempre 0 na criação.
7. **Guard-rail #6 (Acceptance Criteria)** — Toda task (exceto Code Review) DEVE ter acceptance criteria escritas como PO Senior: comportamento do sistema, cenários de borda, linguagem de domínio.
6. **Pre-flight delegado às skills atômicas** — cada skill faz seu próprio pre-flight check
7. **Phase 1 aborta se MCP falhar** — sem conexão Azure, não há o que planejar
8. **Phase 2 continua se falhar** — análise já foi feita, setup pode ser feito depois
9. **Nunca pular fases** — execute sempre na ordem definida
10. **Output consolidado sempre apresentado** — mesmo se fase falhar

## Cache e Repetição

- Se o PBI já tem 1+ child tasks → SKIP automático (guard-rail). Não perguntar.
- Se Phase 1 já foi executada (mesmo PBI, mesma sprint), perguntar se quer re-analisar ou pular
- Se Phase 2 já configurou o PBI, pular automaticamente (dup check nativo do planning-setup + guard-rail)
