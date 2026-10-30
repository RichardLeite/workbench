---
name: planning-setup
description: Prepare sprint by creating 4 FIXED standard tasks (PM Validation, Code Review, Task Owner, Testing — {scope}) per PBI/Bug with OE, RW, Activity, WorkedTime fields. Skip PBIs with existing child tasks. As tasks de development (FE/BE/DB) são responsabilidade da planning-analysis e são condicionais.
---

# Sprint Setup Skill

## Purpose

At the start of each sprint, automatically create the **4 FIXED standard tasks** for each PBI/Product Backlog Item (or Bug) that doesn't already have them:

> **Esta skill cria APENAS as 4 tasks fixas.** As tasks de development (Frontend, Backend, Database) são **condicionais** e são responsabilidade da `planning-analysis` (criadas quando há evidência no escopo da PBI).

> **Dados das 4 tasks fixas:** `uv run --frozen python -m workbench sprint definitions` (itens 4-7)
> **Regras completas (R1-R6):** @.opencode/backlog/adr/ADR-004-sprint-tasks.md

| Task                             | Activity    | OE/RW | Descrição do conteúdo da task                          |
| -------------------------------- | ----------- |:-----:| ------------------------------------------------------ |
| `PM Validation`                  | Testing     | 1h    | Markdown checklist dinâmico conforme escopo da PBI     |
| `Code Review`                    | Development | 1h    | (empty) — sem description                              |
| `Task Owner (Task Definitions)`  | Development | 1h    | HTML fixo com responsabilidades + contrato req/resp    |
| `Testing — {scope}`              | Testing     | 2-6h  | ACs como PO Senior (comportamento, cenários de borda)  |

## Fixed Context

> **Resolve project:** @.opencode/skills/ado-resolve-project

> **⚠️ Importante:** Os exemplos de código abaixo usam `"Sprint Team"` como ilustração. **Sempre substitua** `{{PROJECT}}` e `{{TEAM}}` pelos valores obtidos via `ado.js resolve`.

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

### Mode A: Sprint name

```
Use the skill planning-setup on the sprint "Sprint 05-2026"
```

Flow: identify sprint → list all PBIs/Bugs → process each one.

### Mode B: Specific Work Item ID

```
Use the skill planning-setup on WI 19379
```

Flow: process only that PBI/Bug.

---

## Workflow

### Step 1 — Identify iterations and discover sprint (MCP tool)

If the user provided the sprint name, use the MCP tool:

```
mcp_ado_work_list_team_iterations({
  project: "{{PROJECT}}",
  team: "{{TEAM}}"
})
```

**Return:** array of team iterations with `id`, `name`, `path`, `attributes.startDate`, `attributes.finishDate`, `attributes.timeFrame`.

Extract the `id` **and the `path`** of the iteration matching the provided name. The `path` (e.g., `Sprint Team\Sprint 05-2026`) will be used in Step 4 to ensure created tasks inherit the correct iteration and appear on the sprint Taskboard/Kanban.

| Example       | name             | id                                     | path (save for Step 4)                   |
| ------------- | ---------------- | -------------------------------------- | ---------------------------------------- |
| Current sprint| `Sprint 05-2026` | `48b77c63-63ec-4d0e-b283-14b6ced8e60f` | `{{PROJECT}}\Sprint 05-2026`        |

If not found → list available sprints and ask which to use.

### Step 2 — List sprint PBIs/Bugs (MCP tool)

```
mcp_ado_wit_get_work_items_for_iteration({
  project: "Sprint Team",
  iterationId: "{iteration-id}",
  team: "Sprint Team Team"
})
```

**Return:** list of work items in the iteration. Filter by `type === "Product Backlog Item"` or `type === "Bug"`.

> **⚠️ Note:** This tool returns **all** WIs in the iteration (including tasks). Filter by type in code.

> **Fallback (WIQL via tool):** If the above tool doesn't filter properly, use:
>
> ```
> mcp_ado_wit_query_by_wiql({
>   project: "{{PROJECT}}",
>   wiql: "SELECT [System.Id], [System.Title], [System.WorkItemType] FROM workitems WHERE [System.TeamProject] = '{{PROJECT}}' AND [System.IterationPath] = '{{PROJECT}}\\{sprint_name}' AND ([System.WorkItemType] = 'Product Backlog Item' OR [System.WorkItemType] = 'Bug') ORDER BY [System.Id]"
> })
> ```

### Step 3 — For each PBI, check existing tasks (WIQL via tool)

**There is no dedicated MCP tool for "fetch child tasks of a PBI."** Use WIQL:

```
mcp_ado_wit_query_by_wiql({
  project: "Sprint Team",
  wiql: "SELECT [System.Id], [System.Title] FROM workitems WHERE [System.TeamProject] = 'Sprint Team' AND [System.Parent] = {pbi_id} AND [System.WorkItemType] = 'Task'"
})
```

**Guard-rail:** Se o PBI já tem **1 ou mais** child tasks → **SKIP o PBI inteiro**. Não criar nenhuma tarefa. Pular para o próximo PBI.

Se o PBI tem zero child tasks, criar as 4 tasks fixas:

| Standard task                       | Skip if existing task title contains     |
| ----------------------------------- | ---------------------------------------- |
| `PM Validation`                     | `"PM Validation"` or `"Validação PM"`    |
| `Code Review`                       | `"Code Review"`                          |
| `Task Owner (Task Definitions)`     | `"Task Owner"`                           |
| `Testing — {scope}`                 | `"Testing"`                              |

### Step 3a — Fetch PBI details and generate PM Validation checklist

**For each PBI that needs a PM Validation task**, first fetch the PBI's data and generate a dynamic markdown checklist.

#### 3a.1 — Fetch PBI data

> **Fetch WI:** @.opencode/skills/ado-get-work-item

#### 3a.2 — Analyze scope and generate checklist

Analyze the PBI title + description + acceptance criteria, then classify impact **Frontend / Backend / Database** (same signal table as planning-analysis):

| Layer          | Strong text signals                                                                        |
| -------------- | ------------------------------------------------------------------------------------------ |
| **Frontend**   | modal, screen, tab, form, button, alert, visual, click, display, layout, table, dropdown   |
| **Backend**    | endpoint, job, email, export, integration, calculation, validation, serialization, XML, tag |
| **Database**   | column, table, migration, relationship, unique, backfill, index, key, constraint           |

Generate a markdown description in this **exact format**:

```
{Breve descrição do contexto da PBI — 1 frase}

## Checklist
- [ ] Testes realizados no ambiente de homologação
- [ ] Validação dos critérios de aceite da história
- [ ] {Frontend item} — validar UI, campos e comportamento
- [ ] {Backend item} — validar regras, XML, retorno de APIs
- [ ] {Database item} — validar migration, dados consistentes
- [ ] Regressão: funcionalidades existentes continuam operando normalmente
```

**Regras para geração dos itens:**

| Se a PBI tem impacto em... | Adicionar ao checklist                              |
| -------------------------- | --------------------------------------------------- |
| Frontend                   | `- [ ] Validação visual: campos, telas e fluxos da UI` |
| Backend                    | `- [ ] Validação de regras de negócio e retorno de APIs` |
| Database                   | `- [ ] Migration aplicada corretamente sem quebra de dados` |
| XML/NF-e                   | `- [ ] XML gerado conforme layout e schemas exigidos` |
| Integração externa         | `- [ ] Integração com sistema externo funcionando` |
| Relatório/Job              | `- [ ] Dados do relatório/job consistentes` |
| Feature toggle/switc       | `- [ ] Comportamento com switch ativo e inativo validado` |

> **💡 Formato Markdown com checkboxes clicáveis:** O Azure DevOps renderiza `- [ ]` como checkboxes clicáveis nativamente no modo Markdown. O PM pode clicar para marcar `- [x]` conforme valida cada item.

#### 3a.3 — Learned behavior: HTML tasks must be recreated, not patched

If an existing **PM Validation** task renders the checklist **inline** or the work item returns:

- `multilineFieldsFormat.System.Description = "html"`, or
- visual behavior equivalent to HTML rendering (checkboxes not clickable)

then **DO NOT** try to fix it with `update_work_item`, REST PATCH, or description-only replacement.

**Rule:** Azure DevOps keeps the existing field format for that task. In this case, the correct fix is:

1. Create a **new PM Validation child task from scratch** with `format: "Markdown"`
2. Preserve the same parent PBI and sprint `System.IterationPath`
3. Copy OE/RW/Activity standard values
4. Move the old PM Validation task to `Removed`

> **Persisted learning:** Updating an existing HTML PM Validation task does **not** reliably convert it to Markdown. Recreating the child task is the standard recovery path.

**Exemplo real gerado** (baseado na PBI #20461 — Órgão Público NF-e):

```
Validar implementação de Órgão Público na NF-e.

## Checklist
- [ ] Testes realizados no ambiente de homologação
- [ ] Validação dos critérios de aceite da história
- [ ] Validação visual: campo 'Tipo de operação com Governo' na UI
- [ ] Validação de regras: tpOperGov=Fornecimento/Recebimento conforme finalidade
- [ ] XML gerado: grupo &lt;gCompraGov&gt; com tpEnteGov, pRedutor e tpOperGov
- [ ] Migration aplicada corretamente sem quebra de dados
- [ ] Feature toggle: switch ativo e inativo validados
- [ ] Regressão: NF-e sem órgão público continua normal

Tempo estimado: 1h
```

### Step 4 — Create missing tasks (MCP tool)

> **⚠️ Important — IterationPath for tasks:** The `add_child_work_items` tool **does not automatically inherit** the IterationPath from the parent PBI. Without explicitly setting `System.IterationPath`, created tasks end up with `IterationPath = Sprint Team` (root) and **will not appear on the sprint Taskboard/Kanban**. Use the `path` captured in Step 1 to fill this field.

For each standard task that **does not** exist, use the MCP tool including `System.IterationPath` in `fields`:

```
mcp_ado_wit_add_child_work_items({
  parentId: {pbi_id},
  project: "Sprint Team",
  workItemType: "Task",
  items: [
    {
      title: "Code Review",
      description: "",
      format: "Html",
      fields: {
        "System.IterationPath": "{iteration_path}",  ← required to appear on board
        "Microsoft.VSTS.Scheduling.OriginalEstimate": "1",
        "Microsoft.VSTS.Scheduling.RemainingWork": "1",
        "Microsoft.VSTS.Scheduling.Activity": "Development",
        "Microsoft.VSTS.Scheduling.WorkedTime": "0"
      }
    }
  ]
})
```

> **⚠️ PM Validation format:** Use `format: "Markdown"` (not "Html") for the PM Validation task. Azure DevOps renders `- [ ]` checkboxes as clickable only when the description is in **Markdown** format.

> **⚠️ Recovery standard:** If a PM Validation task already exists but is in HTML format, do not reuse it. Recreate it as a new child task in Markdown and remove the old one.

**Full example** — create all 4 tasks at once (if all are missing):

```
mcp_ado_wit_add_child_work_items({
  parentId: 19379,
  project: "Sprint Team",
  workItemType: "Task",
  items: [
    {
      title: "PM Validation",
      description: "Validar implementação do escopo da PBI #{pbi_id}.\n\n## Checklist\n- [ ] Testes realizados no ambiente de homologação\n- [ ] Validação dos critérios de aceite da história\n- [ ] {Frontend} — validar UI, campos e comportamento\n- [ ] {Backend} — validar regras de negócio e APIs\n- [ ] {Database} — migration e consistência de dados\n- [ ] Regressão: funcionalidades existentes continuam operando normalmente\n\nTempo estimado: 1h",
      format: "Markdown",  ← Markdown necessário para checkboxes clicáveis!
      fields: {
        "System.IterationPath": "Sprint Team\\Sprint 07 - Trib Reform (Part 01)",  ← path from Step 1
        "System.Description": "Validar implementação do escopo da PBI #{pbi_id}.\n\n## Checklist\n- [ ] Testes realizados no ambiente de homologação\n- [ ] Validação dos critérios de aceite da história\n- [ ] {Frontend} — validar UI, campos e comportamento\n- [ ] {Backend} — validar regras de negócio e APIs\n- [ ] {Database} — migration e consistência de dados\n- [ ] Regressão: funcionalidades existentes continuam operando normalmente\n\nTempo estimado: 1h",
        "Microsoft.VSTS.Scheduling.OriginalEstimate": "1",
        "Microsoft.VSTS.Scheduling.RemainingWork": "1",
        "Microsoft.VSTS.Scheduling.Activity": "Testing",
        "Microsoft.VSTS.Scheduling.WorkedTime": "0"
      }
    },
    {
      title: "Code Review",
      description: "",
      format: "Html",
      fields: {
        "System.IterationPath": "Sprint Team\\Sprint 07 - Trib Reform (Part 01)",  ← path from Step 1
        "Microsoft.VSTS.Scheduling.OriginalEstimate": "1",
        "Microsoft.VSTS.Scheduling.RemainingWork": "1",
        "Microsoft.VSTS.Scheduling.Activity": "Development",
        "Microsoft.VSTS.Scheduling.WorkedTime": "0"
      }
    },
    {
      title: "Task Owner (Task Definitions)",
      description: "{DESCRIPTION_HTML}",
      format: "Html",
      fields: {
        "System.IterationPath": "Sprint Team\\Sprint 07 - Trib Reform (Part 01)",  ← path from Step 1
        "System.Description": "{DESCRIPTION_HTML}",
        "Microsoft.VSTS.Scheduling.OriginalEstimate": "1",
        "Microsoft.VSTS.Scheduling.RemainingWork": "1",
        "Microsoft.VSTS.Scheduling.Activity": "Development",
        "Microsoft.VSTS.Scheduling.WorkedTime": "0"
      }
    },
    {
      title: "Testing — {pbi_title}",
      description: "{TESTING_ACs}",
      format: "Html",
      fields: {
        "System.IterationPath": "Sprint Team\\Sprint 07 - Trib Reform (Part 01)",  ← path from Step 1
        "System.Description": "{TESTING_ACs}",
        "Microsoft.VSTS.Scheduling.OriginalEstimate": "{2-6h realista conforme escopo}",
        "Microsoft.VSTS.Scheduling.RemainingWork": "{2-6h realista conforme escopo}",
        "Microsoft.VSTS.Scheduling.Activity": "Testing",
        "Microsoft.VSTS.Scheduling.WorkedTime": "0"
      }
    }
  ]
})
```

**⚠️ Note on `fields` vs parameters:** The `description` field is a mandatory item-level parameter (not to be confused with `fields.System.Description`). 

| Task                | `description` (item-level) | `fields.System.Description` | `format` |
| ------------------- | -------------------------- | --------------------------- | -------- |
| **PM Validation**   | Checklist markdown text    | Checklist markdown text     | `Markdown` |
| **Code Review**     | `""` (empty)               | (não setar)                 | `Html`   |
| **Task Owner**      | `""` (empty)               | HTML completo               | `Html`   |
| **Testing**         | ACs de teste (PO Senior)   | ACs de teste (PO Senior)    | `Html`   |

> **⚠️ Markdown vs Html:** PM Validation usa `format: "Markdown"` porque o Azure DevOps **só renderiza `- [ ]` como checkboxes clicáveis em descrições no formato Markdown**. As demais tasks continuam em Html.

**Advantages of `add_child_work_items` over REST PATCH:**

- ✅ No need to build relations manually
- ✅ Creates multiple children in 1 call
- ✅ Handles linking automatically
- ✅ Supports `fields` for OE, RW, Description, IterationPath

### Step 5 — Output

Return a summary:

```json
{
  "sprint": "Sprint 05-2026",
  "iteration_path": "Sprint Team\\Sprint 05-2026",
  "total_pbis": 15,
  "results": [
    {
      "pbi_id": 19379,
      "pbi_title": "CRM | Link Campaign with Sale",
      "tasks_created": ["Code Review", "Task Owner (Task Definitions)", "Testing — CRM | Link Campaign with Sale"],
      "tasks_skipped_existing": ["PM Validation"],
      "status": "partial"
    }
  ],
  "summary": {
    "tasks_created": 42,
    "tasks_skipped": 36,
    "pbis_fully_setup": 12,
    "pbis_partial": 3
  },
  "preflight": {
    "mcp_tool_test": true,
    "mcp_enabled": true,
    "token_present": true,
    "connection_ok": true
  }
}
```

---

## Task Owner HTML Description (copied from real Azure)

```html
<div>
  <h3 style="box-sizing:border-box;font-weight:600;">
    Owner Responsibilities
  </h3>
  <ul style="box-sizing:border-box;padding:0px 0px 0px 40px;">
    <li style="box-sizing:border-box;">
      Fully understand the story's requirements
    </li>
    <li style="box-sizing:border-box;">
      Define (or propose) the communication contract between frontend and backend:
      <ul style="box-sizing:border-box;padding:0px 0px 0px 40px;">
        <li style="box-sizing:border-box;">Input payload (request)</li>
        <li style="box-sizing:border-box;">Output payload (response)</li>
      </ul>
    </li>
    <li style="box-sizing:border-box;">
      Document relevant business rules
    </li>
    <li style="box-sizing:border-box;">
      Anticipate potential technical questions and align with stakeholders
    </li>
    <li style="box-sizing:border-box;">
      Ensure scope is clear for execution without rework
    </li>
  </ul>
  <h3 style="box-sizing:border-box;font-weight:600;">
    🔄 Work Dynamics
  </h3>
  <ul style="box-sizing:border-box;padding:0px 0px 0px 40px;">
    <li style="box-sizing:border-box;">
      This should be
      <strong style="box-sizing:border-box;"
        >always the first task to be pulled</strong
      >
    </li>
    <li style="box-sizing:border-box;">
      The developer who pulls this task becomes the
      <strong style="box-sizing:border-box;">story owner</strong>
    </li>
    <li style="box-sizing:border-box;">
      The defined contract must be followed by subsequent implementations
    </li>
    <li style="box-sizing:border-box;">
      Adjustments can be made throughout development,
      <strong style="box-sizing:border-box;"
        >as long as they don't break the defined pattern</strong
      >, except for well-aligned exceptions
    </li>
  </ul>
  <h3 style="box-sizing:border-box;font-weight:600;">🎯 Goal</h3>
  <ul style="box-sizing:border-box;padding:0px 0px 0px 40px;">
    <li style="box-sizing:border-box;">Reduce rework</li>
    <li style="box-sizing:border-box;">
      Increase delivery predictability
    </li>
    <li style="box-sizing:border-box;">
      Improve frontend-backend communication
    </li>
    <li style="box-sizing:border-box;">Strengthen ownership mindset</li>
    <li style="box-sizing:border-box;">
      Increase technical delivery quality
    </li>
  </ul>
  <br />
</div>
```

> **Note:** This description was extracted from real Azure task `#19571`. It must be used **exactly as is** — unchanged.

---

## Guardrails

1. **Pre-flight check mandatory.** Test MCP tool directly first; if it fails, validate MCP config + token.
2. **Nunca criar tasks em PBI que já tem child tasks.** Se PBI tem 1+ child tasks → SKIP completo.
3. **Only create the 4 FIXED standard tasks.** PM Validation, Code Review, Task Owner, Testing — {scope}. Don't create Tech Lead Validation, PO Validation, or any other variation. (Tasks de development como Frontend, Backend, Database são responsabilidade da `planning-analysis` e são criadas apenas se houver evidência.)
4. **Don't alter the parent PBI.** @.opencode/backlog/adr/ADR-004-sprint-tasks.md (R4)
5. **PM Validation description must be markdown checklist.** PM Validation leva `format: "Markdown"` com checklist `- [ ]` dinâmico. Code Review não leva description. Task Owner leva o HTML fixo. Testing leva ACs como PO Senior em formato Html.
6. **OE = RW** for all tasks. Activity obrigatório (Development | Design | Testing). WorkedTime = 0 sempre.
7. **Task Owner with EXACT description.** Use the HTML provided in this skill — do not modify the text.
8. **⛔️ IterationPath required on tasks.** The `add_child_work_items` tool does NOT inherit the parent PBI's iteration. ALWAYS include `"System.IterationPath": "{iteration_path}"` in each task's `fields`, using the `path` captured in Step 1. Without this, tasks won't appear on the sprint Taskboard/Kanban.
9. **PM Validation description também em `fields.System.Description`.** Além do `description` item-level, copie o mesmo texto para `fields.System.Description` para garantir que o campo seja persistido corretamente no Azure Boards.
10. **Checklist contextual à PBI.** Os itens do checklist devem ser gerados **dinamicamente** com base no título e escopo da PBI, nunca um template genérico fixo. Analise title + description + acceptance criteria para determinar quais itens incluir.
11. **Nunca tentar converter PM Validation HTML via patch.** Se a task já existir em HTML e o checklist renderizar inline, o padrão é recriar uma nova child task em Markdown e mover a antiga para `Removed`.
12. **Activity field obrigatório:** PM Validation → Testing, Code Review → Development, Task Owner → Development, Testing → Testing.
13. **Testing — {scope} é fixa, sempre criada**, com OE/RW realista (2-6h conforme escopo da PBI). ACs descrevendo cenários de teste específicos, não genéricos. Activity = Testing, WorkedTime = 0.

---

## Examples

### Example 1: Whole Sprint

**User:** `Use the skill planning-setup on the sprint "Sprint 05-2026"`

**Action:**

1. Pre-flight: @.opencode/skills/ado-preflight → ✅ MCP connected, token OK, connection OK
2. `mcp_ado_work_list_team_iterations({ project: "Sprint Team", team: "Sprint Team Team" })` → finds Sprint 05-2026 with ID `48b77c63-...` and **path** `Sprint Team\Sprint 05-2026`
3. `mcp_ado_wit_get_work_items_for_iteration({ project, iterationId, team })` → returns 79 WIs, filters to 15 PBIs
4. For each PBI:
   - PBI #19379: `mcp_ado_wit_query_by_wiql({ wiql: "WHERE Parent=19379..." })` → already has "PM Validation" ✅ skip, no "Code Review" ❌, no "Task Owner" ❌
   - PBI #19024: already has all 3 → skip everything
   - PBI #19386: has none → create all 3 with `mcp_ado_wit_add_child_work_items`, including `"System.IterationPath": "Sprint Team\\Sprint 05-2026"` in each task's `fields`
5. Output: summary with created/skipped

### Example 2: Specific PBI — with PM Validation checklist

**User:** `Use the skill planning-setup on WI 19379`

**Action:**

1. Pre-flight check
2. Fetch WI 19379 → confirm it's a PBI
3. Check existing child tasks → missing PM Validation, Code Review
4. Fetch PBI #19379 title + description → "CRM | Link Campaign with Sale"
5. Analyze: Frontend (modal, selection) + Backend (query) + Database (relational)
6. Generate markdown checklist for PM Validation:
   ```markdown
   Validar implementação de CRM | Link Campaign with Sale.

   ## Checklist
   - [ ] Testes realizados no ambiente de homologação
   - [ ] Validação dos critérios de aceite da história
   - [ ] Validação visual: modal de seleção e UI da campanha
   - [ ] Validação de regras: query de campanhas e link com venda
   - [ ] Migration aplicada corretamente sem quebra de dados
   - [ ] Regressão: funcionalidades existentes continuam operando normalmente

   Tempo estimado: 1h
   ```
7. Create PM Validation (format: Markdown) + Code Review (format: Html)
8. Output: that PBI's result

### Example 3: Existing PM Validation created in HTML

**Situation:** PBI already has a PM Validation task, but the checklist appears inline and the work item metadata shows `multilineFieldsFormat.System.Description = "html"`.

**Action:**

1. Do **not** patch the existing description trying to convert format
2. Create a new PM Validation child task with the same contextual markdown checklist using `format: "Markdown"`
3. Set `System.IterationPath`, `OriginalEstimate = 1`, `RemainingWork = 1`, `Activity = Testing`
4. Move the previous PM Validation task to `Removed`
5. Report both IDs in the final output

---

## Success Criteria

- ✅ Every sprint PBI/Bug has the 4 FIXED tasks: PM Validation, Code Review, Task Owner, Testing — {scope}
- ✅ No duplicate tasks were created
- ✅ Task Owner has the correct HTML description
- ✅ **PM Validation has markdown checklist with `- [ ]` clickable items** — contextual à PBI
- ✅ Existing PM Validation tasks found in HTML are recreated instead of patched
- ✅ OE = RW on all standard tasks (PM Validation: 1h, Code Review: 1h, Task Owner: 1h, Testing: 2-6h conforme escopo)
- ✅ Activity field preenchido em todas as tasks (PM Validation: Testing, Code Review: Development, Task Owner: Development, Testing: Testing)
- ✅ WorkedTime = 0 em todas as tasks criadas
- ✅ Nothing on the parent PBI was altered
- ✅ Created tasks have `System.IterationPath` matching the sprint, appearing correctly on the Taskboard/Kanban
