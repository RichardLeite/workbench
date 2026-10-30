---
name: planning-analysis
description: Analyze Azure DevOps work items (PBIs/Bugs), classify Frontend/Backend/Database impact, create child tasks (FE/BE/DB — condicionais) com Activity e WorkedTime=0 (SEM OE/RW). No contexto do sprint-pipeline, esta skill cuida APENAS das condicionais (FE/BE/DB). As 4 tasks fixas (Code Review, Task Owner, PM Validation, Testing — {scope}) são responsabilidade da planning-setup. @.opencode/backlog/adr/ADR-004-sprint-tasks.md (R4)
---

# Planning Guide Skill

## Purpose

Analyze work items (Product Backlog Item or Bug) from Azure DevOps, break down the demand into `Frontend`, `Backend` e `Database` cards **apenas quando há evidência** no escopo da PBI, and create child tasks in Azure Boards com **Activity e WorkedTime=0** (sem OE/RW — estimativa fica a cargo do dev durante a execução). No contexto do **sprint-pipeline**, esta skill cuida **APENAS das condicionais** (Frontend, Backend, Database). As **4 tasks fixas** (Code Review + Task Owner + PM Validation + `Testing — {scope}`) são responsabilidade da `planning-setup`. @.opencode/backlog/adr/ADR-004-sprint-tasks.md (R4)

## Fixed Context

> **Resolve project:** @.opencode/skills/ado-resolve-project

> **⚠️ Importante:** Os exemplos de código abaixo usam `"Sprint Team"` como ilustração. **Sempre substitua** `{{PROJECT}}` e `{{TEAM}}` pelos valores obtidos via `ado.js resolve`. Para hotfix, use `Hotfix Team` (`node .opencode/scripts/ado.js resolve --type hotfix`).

Use o `defaultProject` do config (`Sprint Team`) como padrão.

---

## Prerequisites

### 1. Azure DevOps MCP (native OpenCode tools)

This skill uses the **native OpenCode MCP tools** (`azure-devops_*`) for all Azure DevOps operations. These tools are made available by the OpenCode runtime when the MCP is connected.

No manual configuration needed — just ensure MCP is active in the session.

### 2. PAT token

The env var `ADO_MCP_AUTH_TOKEN` (or the workbench `.env`) must contain a valid PAT with Work Items write permission.

---

> **🔴 Pre-flight:** @.opencode/skills/ado-preflight

---

## Input — Activation Modes

The skill accepts **3 input modes**:

### Mode A: Specific Work Item ID

```
Use the skill planning-analysis to analyze WI 19379
```

Flow: fetch PBI/Bug by ID → analyze description → generate cards

### Mode B: Whole Sprint

```
Use the skill planning-analysis to analyze the sprint "Sprint 05-2026"
```

Flow: list all PBIs/Bugs in sprint → ask which to analyze → OR analyze all

### Mode C: Free-form description (without Azure)

```
Use the skill planning-analysis to analyze this demand:
[task description]
```

Flow: use the provided description directly (no Azure fetch)

---

## Workflow

### MCP tools vs WIQL vs REST Mapping

| Step | Operation                   | Primary approach                  | Fallback              |
| ---- | --------------------------- | --------------------------------- | --------------------- |
| 1    | Fetch WI by ID              | `mcp_ado_wit_get_work_item`       | REST GET              |
| 2    | Classification              | **LLM Analysis** (no Azure call)  | —                     |
| 3    | Generate cards              | **LLM Analysis** (no Azure call)  | —                     |
| 4    | Check child tasks           | `mcp_ado_wit_query_by_wiql` (WIQL)| REST POST wiql        |
| 5    | Create child tasks          | `mcp_ado_wit_add_child_work_items`| REST PATCH + relations|

> @.opencode/backlog/adr/ADR-004-sprint-tasks.md (R4)

> **Fetch WI:** @.opencode/skills/ado-get-work-item

### Step 2 — Classify impact

Analyze the `title` + `description` of the work item and classify:

| Layer            | Strong text signals                                                                        | Cria task? |
| ---------------- | ------------------------------------------------------------------------------------------ |:----------:|
| **Frontend**     | modal, screen, tab, form, button, alert, visual ordering, focus, click, display, payload, layout, table, visual search, dropdown | **Condicional** — APENAS se há UI |
| **Backend**      | endpoint, job, email, export, integration, calculation rule, validation, serialization, report, scheduled job, fallback, default | **Condicional** — APENAS se há lógica/API |
| **Database**     | column, table, migration, relationship, unique, backfill, index, key, type, default value, constraint | **Condicional** — APENAS se há mudança estrutural |

> **⚠️ Regra fundamental:** Cada uma das 3 camadas (FE/BE/DB) é **condicional**. Criar a task APENAS quando houver evidência clara no escopo da PBI. Se não houver sinal, **NÃO criar**. Nunca presumir; nunca criar task vazia. No contexto do **sprint-pipeline**, as **4 tasks fixas** (Code Review, Task Owner, PM Validation, `Testing — {scope}`) são SEMPRE criadas pela `planning-setup`, e esta skill cuida apenas das condicionais (FE/BE/DB).

### Step 3 — Generate cards

**Tasks condicionais NÃO devem ter `OriginalEstimate` nem `RemainingWork` preenchidos.** Apenas `Activity` e `WorkedTime = 0`. A estimativa é feita pelo dev durante a execução, não previamente.

> @.opencode/backlog/adr/ADR-004-sprint-tasks.md (R4)

**Real team-calibrated benchmarks** (referência histórica — não mais aplicados nas tasks condicionais):

| Feature                                     | Frontend | Backend | Database |
| ------------------------------------------- | -------- | ------- | -------- |
| Advanced search (2 types)                   | 7h       | 4h      | —        |
| Select Print Type when Printing             | 5h       | 4h      | 1h       |
| Product registration with Sale Base         | 10h      | 5h      | 1h       |
| Customer registration history               | 5h       | 5h      | 1h       |
| XML import — new product link modal         | 5h       | 0h      | 0h       |
| Parameters / Warranty Modal                 | 10h      | 3h      | 1h       |
| Product query — Code column                 | 3h       | 0h      | 0h       |
| CRM — Link Campaign with Sale               | 7h       | 5h      | 1h       |
| CRM — Link Campaign with Sale at POS        | 5h       | 3h      | 0h       |
| CRM — Filters Modal                         | 10h      | 5h      | 1h       |

**Complementary heuristics (referência histórica — não aplicadas em tasks condicionais):**

- As tasks condicionais (FE/BE/DB) **NÃO têm OE/RW preenchidos**. Apenas `Activity` e `WorkedTime = 0`. Estimativa é feita pelo dev durante a execução.
- Se a PBI for pequena e exigir um único card condicional → criar **apenas 1** (ex.: só `Frontend` para tela isolada)
- Se a PBI for complexa e exigir múltiplos cards condicionais → criar **todos os que tiverem evidência**
- **Database é SEMPRE 1 task única**, nunca quebrar em 2 (mesmo com migration + seed + índices)

### Step 4 — Generate cards

Generate **0 a 3 cards condicionais** (no contexto do sprint-pipeline): Frontend, Backend, Database. Cada um é condicional — criar APENAS se houver evidência.

> **Definições das tasks condicionais:** `node .opencode/scripts/sprint.js definitions` (itens 1-3)
> **Regras completas (R1-R6):** @.opencode/backlog/adr/ADR-004-sprint-tasks.md

| Card | Condição | OE | RW | WorkedTime |
|------|----------|:--:|:--:|:----------:|
| `Frontend — {scope}` | Há UI envolvida | — | — | 0 |
| `Backend — {scope}` | Há lógica/API/regra | — | — | 0 |
| `Database — {scope}` | Há migração/índice/seed | — | — | 0 |

> **Nota (sprint-pipeline):** Esta skill gera apenas as **condicionais** (FE/BE/DB). As **4 tasks fixas** (Code Review + Task Owner + PM Validation + `Testing — {scope}`) são responsabilidade da `planning-setup`. `node .opencode/scripts/sprint.js definitions` (itens 4-7) Tasks de development (FE/BE/DB) só existem se a PBI tiver evidência clara de que a camada é necessária.

**Acceptance Criteria obrigatório nos 3 cards** (no contexto do sprint-pipeline), escritos como PO Senior:
- Comportamento do sistema, não implementação
- Cenários de borda + fluxo feliz + exceções
- Linguagem do domínio (termos de negócio)
- Usar Gherkin (`Dado... Quando... Então...`) para cenários complexos

### Step 5 — Check existing tasks (avoid duplicates) — WIQL via tool

**Before creating any task in Azure**, fetch the PBI/Bug's existing child tasks.

**There is no dedicated MCP tool for "fetch child tasks of a PBI."** Use WIQL:

```
mcp_ado_wit_query_by_wiql({
  project: "{{PROJECT}}",
  wiql: "SELECT [System.Id], [System.Title] FROM workitems WHERE [System.TeamProject] = 'Sprint Team' AND [System.Parent] = {parentId} AND [System.WorkItemType] = 'Task'"
})
```

Extract the existing task titles and check:

| Card to create   | Skip if existing task title contains |
| ---------------- | ------------------------------------ |
| `Frontend — ...` | `"Frontend"`                         |
| `Backend — ...`  | `"Backend"`                          |
| `Database — ...` | `"Database"` or `"Banco"`            |

**Rules:**

- If the task already exists → **SKIP** (don't create duplicate)
- If a task of the same type but different scope already exists → **SKIP** (already has that layer's card)
- If NO tasks exist → **CREATE** all
- If some exist → **CREATE** only the missing ones

**Decision example:**

| Existing Azure tasks      | Cards suggested by analysis | Action              |
| ------------------------- | --------------------------- | ------------------- |
| Frontend, Backend         | Frontend, Backend, Database | Create only **Database** |
| Frontend                  | Frontend, Backend           | Create only **Backend**  |
| (none)                    | Frontend, Backend, Database | Create **all**       |

### Step 6 — Create in Azure (if requested) — MCP tools

For each card that **passed the duplicate validation** (Step 5), create a **Task** child of the original PBI/Bug:

#### 6a. Create child tasks

> **Tasks condicionais SEM OE/RW**: os campos `OriginalEstimate` e `RemainingWork` **NÃO devem ser preenchidos** para `Frontend`, `Backend` e `Database`. Apenas `Activity` e `WorkedTime = 0`.

```
mcp_ado_wit_add_child_work_items({
  parentId: {parentId},
  project: "{{PROJECT}}",
  workItemType: "Task",
  items: [
    {
      title: "Frontend — Task name",
      fields: {
        "System.Description": "<div>{description_html}</div>",
        "Microsoft.VSTS.Scheduling.Activity": "Development",
        "Microsoft.VSTS.Scheduling.WorkedTime": "0"
        // OriginalEstimate e RemainingWork NÃO setados (vazios)
      }
    },
    {
      title: "Backend — Task name",
      fields: {
        "System.Description": "<div>{description_html}</div>",
        "Microsoft.VSTS.Scheduling.Activity": "Development",
        "Microsoft.VSTS.Scheduling.WorkedTime": "0"
        // OriginalEstimate e RemainingWork NÃO setados (vazios)
      }
    }
  ]
})
```

**Advantages:** No need to manually build relations, creates multiple children in 1 call.

> @.opencode/backlog/adr/ADR-004-sprint-tasks.md (R4)

### Step 7 — Output for the user

Always return a text summary + JSON:

```json
{
  "work_item_id": 19379,
  "work_item_title": "CRM | Link Campaign with Sale",
  "analysis": {
    "needs_frontend": true,
    "needs_backend": true,
    "needs_database": true
  },
  "cards": [
    {
      "type": "frontend",
      "title": "Frontend — Link Campaign with Sale",
      "objective": "...",
      "scope": ["...", "..."],
      "acceptance_criteria": ["...", "..."],
      "dependencies": [],
      "original_estimate": null,
      "remaining_work": null,
      "worked_time": 0,
      "justification": "...",
      "action": "created"
    }
  ],
  "created_in_azure": true,
  "skipped_existing": ["Backend — Link Campaign with Sale"],
  "azure_links": ["https://dev.azure.com/your-org/.../workitems/19613"],
  "preflight": {
    "mcp_tool_test": true,
    "mcp_enabled": true,
    "token_present": true,
    "connection_ok": true
  }
}
```

> **Campos removidos do output JSON:** `story_points`, `parent_sp_suggested`, `parent_sp_updated`. `hours` foi removido (estimativa é feita pelo dev). Adicionado `original_estimate: null` e `remaining_work: null` para explicitar que as tasks condicionais ficam vazias. @.opencode/backlog/adr/ADR-004-sprint-tasks.md

---

## HTML Templates for Description

> See `references/templates/ado-description.html` for the HTML template.

---

## Card Naming Rules

Gerar **0 a 3 cards condicionais** por PBI (no contexto do sprint-pipeline) — criar APENAS quando há evidência:

| # | Title Pattern | Activity | OE | RW | Aceita critérios? | Condição |
|:-:|--------------|----------|:--:|:--:|:----------------:|----------|
| 1 | `Frontend — {demand name}` | Development | — | — | ✅ | Condicional (se há UI) |
| 2 | `Backend — {demand name}` | Development | — | — | ✅ | Condicional (se há lógica/API) |
| 3 | `Database — {demand name}` | Development | — | — | ✅ | Condicional (se há migration/seed/índice; sempre 1 task única) |

> **OE/RW vazios** para todas as condicionais. Estimativa é feita pelo dev durante a execução.
> **Se a PBI não tem mudança de banco:** NÃO criar a task Database (não criar placeholder "No structural changes" — apenas omitir a task).

---

## Guardrails

1. **Pre-flight check mandatory.** Before any Azure operation: test MCP tool directly first; if it fails, check MCP config + token. If all fail, STOP and return error.
2. **Never change PBI/Bug fields.** Title, description, state, iteration, priority, etc. are the PO's source of truth. @.opencode/backlog/adr/ADR-004-sprint-tasks.md (R4)
3. **Tasks condicionais SEM OE/RW.** `Frontend`, `Backend`, `Database` NÃO devem ter `OriginalEstimate` nem `RemainingWork` preenchidos. Apenas `Activity` e `WorkedTime = 0`.
4. **WorkedTime = 0** sempre na criação, em TODAS as tasks.
5. **Never create duplicate tasks.** ALWAYS check existing child tasks before creating. If any child task exists → SKIP the entire PBI.
6. **Create only the cards that have evidence** (no contexto do sprint-pipeline): 0 a 3 cards condicionais (Frontend, Backend, Database). As 4 fixas (Code Review, Task Owner, PM Validation, `Testing — {scope}`) são criadas pela `planning-setup`. Never create empty or assumptive cards.
7. **Activity field obrigatório** em toda task: Development | Design | Testing.
8. **Acceptance criteria obrigatórios** em todas as tasks de development criadas (FE, BE, DB). Escritos como PO Senior: comportamento, cenários de borda, linguagem de domínio.
9. **Don't assume a layer without evidence** in the demand text. Cada task condicional (FE/BE/DB) precisa de sinal claro no título/descrição da PBI. Se não houver, **NÃO criar**.
10. **If the task says "works like today"**, explicitly record it in acceptance criteria.
11. **If legacy and new flows coexist**, mention in scope.
12. **Database é SEMPRE 1 task única e CONDICIONAL.** `Database — {scope}` deve ter apenas `Activity = Development` e `WorkedTime = 0h`. **NUNCA quebrar em duas subtasks de banco** (ex.: "Database — migration" + "Database — seed"), mesmo que a PBI tenha múltiplas alterações estruturais. **Se não há mudança estrutural de banco, NÃO criar a task Database** (apenas omitir).
13. **Attachments/images** are visual support, never the sole source of rules.
14. **Ask before creating in Azure** if the user hasn't explicitly requested it.

---

## Examples

### Example 1: Work Item by ID

**User:** `Use the skill planning-analysis to analyze WI 19379`

**Action:**

1. `mcp_ado_wit_get_work_item({ id: 19379, project: "Sprint Team" })` → fetch PBI
2. Title: "CRM | Link Campaign with Sale"
3. Description mentions: selection modal, customers, campaigns, query endpoint, campaigns table
4. Classification: Frontend (modal, selection), Backend (query), Database (relational table)

**Output:**

```json
{
  "cards": [
    {
      "type": "frontend",
      "title": "Frontend — Link Campaign with Sale",
      "original_estimate": null,
      "remaining_work": null,
      "worked_time": 0,
      "action": "created"
    },
    {
      "type": "backend",
      "title": "Backend — Link Campaign with Sale",
      "original_estimate": null,
      "remaining_work": null,
      "worked_time": 0,
      "action": "created"
    },
    {
      "type": "database",
      "title": "Database — Link Campaign with Sale",
      "original_estimate": null,
      "remaining_work": null,
      "worked_time": 0,
      "action": "created"
    }
  ],
  "created_in_azure": true,
  "preflight": {
    "mcp_tool_test": true,
    "mcp_enabled": true,
    "token_present": true,
    "connection_ok": true
  }
}
```

> **Tasks condicionais SEM OE/RW.** Apenas `Activity` e `WorkedTime = 0` são persistidos. A estimativa de horas é responsabilidade do dev durante a execução, não previamente.

### Example 2: Whole Sprint

**User:** `Use the skill planning-analysis to analyze the sprint "Sprint 05-2026"`

**Action:**

1. List all PBIs/Bugs in sprint 05-2026 (79 items)
2. Ask: "Found 79 work items. Do you want to analyze all or a specific one?"
3. If user selects one, follow normal flow
4. If user wants all, process in batch

### Example 3: Frontend Only

**User:** Describes a button color adjustment demand

**Action:**

- Classification: Frontend only
- Frontend: condicional (criada porque há UI envolvida)

**Output:** Only 1 Frontend card (condicional), com `original_estimate: null`, `remaining_work: null`, `worked_time: 0`. Backend and Database NOT generated (sem evidência). Plus as 4 fixas (Code Review + Task Owner + PM Validation + Testing — {scope}) criadas pela `planning-setup` → total: 5 tasks.
