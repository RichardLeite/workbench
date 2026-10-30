# Agent Output Contracts

> Standardized JSON output schemas for all agents. Validated by orquestrador via `contracts.ts`.
> Every agent output MUST conform to its schema — the orchestrator validates before proceeding.

---

## Common Schema

All agents share a base structure for errors and generic responses:

```json
{
  "tipo": "resumo|analise|decisao|revisao|resultado|recomendacao_custo|auditoria_custo|analise_pr",
  "timestamp": "ISO date (auto-injected by orchestrator)",
  "context": { "agent": "agent-name", "task": "TASK-XXXX or description" }
}
```

### Error Fallback (all agents)

```json
{
  "tipo": "resumo|revisao|decisao|resultado",
  "erro": "Error description",
  "motivo": "Root cause (optional)",
  "sugestao": "Suggested remediation (optional)"
}
```

---

## Per-Agent Schemas

### Analysis Agents

#### explorador — Codebase Search & Navigation

Read-only file discovery and pattern matching.

**File Discovery / Pattern Search:**
```json
{
  "tipo": "resultado",
  "arquivos": ["src/controllers/CustomerController.js:15 - list method", "src/services/CustomerService.js:42 - findByEmail"],
  "resposta": "Found 2 files matching 'customer' in controllers and services"
}
```

**Error:**
```json
{
  "tipo": "resultado",
  "erro": "Could not find matches. Reason: No files matching 'FooBar' pattern"
}
```

#### explore — Fast Codebase Exploration

Lighter than explorador. Same `tipo: "resultado"` pattern. No write/edit access. Returns file paths + line numbers + brief context.

---

### Review Agents

#### revisor — Code Review & Architecture Analysis

**Code Review:**
```json
{
  "tipo": "revisao",
  "analise": "Missing null check on customerId",
  "severidade": "alta",
  "recomendacao": "Add guard clause before findById call",
  "alternativas": "Optional chaining (?.)",
  "nivel_confianca": "alta"
}
```

**Architecture Review:**
```json
{
  "tipo": "revisao",
  "analise": "Controller has business logic",
  "severidade": "media",
  "recomendacao": "Extract to service layer",
  "alternativas": ["Keep in controller if simple", "Extract to helper"],
  "nivel_confianca": "alta"
}
```

**Error:**
```json
{
  "tipo": "revisao",
  "erro": "Could not review. Reason: Insufficient context provided"
}
```

#### pr-insight — PR Analysis

Complete PR analysis with Azure DevOps integration.

```json
{
  "tipo": "analise_pr",
  "pr_number": 123,
  "repo": "my-api",
  "task_number": 20028,
  "veredito": "approved | needs_changes | blocked",
  "total_findings": {
    "critical": 0,
    "warnings": 2,
    "suggestions": 3
  },
  "por_area": {
    "simplicidade": 0,
    "acoplamento": 1,
    "performance": 0,
    "testabilidade": 1,
    "seguranca": 0,
    "arquitetura": 0,
    "completude": 0,
    "deploy": 0,
    "observabilidade": 0,
    "configuracao": 0,
    "compatibilidade": 0,
    "rollback": 0,
    "dependencias": 0
  },
  "cobertura_task": {
    "encontrada": true,
    "implementados": 3,
    "nao_implementados": 0,
    "parciais": 1
  },
  "acoes_realizadas": {
    "github_comments_posted": true,
    "github_approved": true,
    "github_changes_requested": false,
    "github_comment_count": 5,
    "teams_notified": true,
    "teams_recipient": "Igor Gomes"
  },
  "nivel_confianca": "alta"
}
```

---

### Implementation Agents

#### pedreiro — Fast Implementation

Well-defined task execution following orchestrator plan.

**Implementation:**
```json
{
  "tipo": "resumo",
  "alteracoes": ["src/controller.js: add validation"],
  "verificacao": "Tests: passed"
}
```

**Bugfix:**
```json
{
  "tipo": "resumo",
  "alteracoes": ["src/service.js: fix null check"],
  "causa": "NullPointerException when customerId is undefined",
  "verificacao": "Regression: passed"
}
```

**Error:**
```json
{
  "tipo": "resumo",
  "erro": "Failed to apply change",
  "motivo": "File not found at expected path",
  "sugestao": "Verify project structure first"
}
```

#### backend-dev / frontend-dev / database-dev — Generic Implementers

Same schema as pedreiro:

```json
{
  "tipo": "resumo",
  "alteracoes": ["src/controllers/ExampleController.js: description"],
  "verificacao": "Tests: passed / N/A"
}
```

**Error:**
```json
{
  "tipo": "resumo",
  "erro": "Could not apply change",
  "motivo": "...",
  "sugestao": "..."
}
```

---

### Decision Agents

#### gestor-tokens — Token Cost Manager

**Recommendation (Reactive Mode):**
```json
{
  "tipo": "recomendacao_custo",
  "agente_sugerido": "explorador",
  "agente_alternativo": "backend-dev",
  "modelo_recomendado": "haiku",
  "custo_estimado": {
    "agente_sugerido": { "tokens": 1200 },
    "agente_alternativo": { "tokens": 3500 },
    "economia": { "porcentagem": "66%" }
  },
  "pode_paralelizar": ["explorador + database-dev"],
  "context_engineering": {
    "lazy_load": "standard",
    "compaction_needed": false,
    "mask_candidates": 0
  }
}
```

**Audit:**
```json
{
  "tipo": "auditoria_custo",
  "total_tokens_estimado": 125000,
  "delegacoes": [
    { "agente": "backend-dev", "tokens": 45000, "otimizavel": true }
  ],
  "context_health": {
    "utilizacao": "72%",
    "status": "warning",
    "acao": "observation masking"
  },
  "score_eficiencia": "B"
}
```

#### arbitro — Decision Arbiter

**Decision:**
```json
{
  "tipo": "decisao",
  "contexto": "What was being decided",
  "conflito": "Disagreement description",
  "decisao": "Chosen path",
  "justificativa": "Why, with evidence",
  "fontes": ["vault note", "code pattern"],
  "alternativas_descartadas": [
    { "alternativa": "...", "motivo": "..." }
  ],
  "nivel_confianca": "alta|media"
}
```

**Insufficient data:**
```json
{
  "tipo": "decisao",
  "erro": "Cannot decide",
  "falta": ["Missing info"],
  "acao_necessaria": ["Ask X"]
}
```

---

### Knowledge Agents

#### vault-updater — Obsidian Vault Documentation

Returns JSON only (never Markdown):
```json
{
  "tipo": "vault_update",
  "status": "updated|unchanged|skipped",
  "classificacao": "STRUCTURAL_ADD|RULE_CHANGE|NEW_FLOW|FLOW_CHANGE|NEW_DOMAIN|FIX_ONLY|NO_CHANGE",
  "alteracoes": [
    { "path": "database/06-financeiro.md", "tipo": "STRUCTURAL_ADD", "descricao": "Novo endpoint GET /extrato (TASK-XXXX)" }
  ],
  "erro": "opcional se falhar"
}
```

| Campo | Obrigatório | Descrição |
|-------|:-----------:|-----------|
| `tipo` | ✅ | `"vault_update"` |
| `status` | ✅ | `"updated"` se alterou, `"unchanged"` se FIX_ONLY/NO_CHANGE, `"skipped"` se não aplicável |
| `classificacao` | ✅ | Um dos 7 tipos da árvore de decisão |
| `alteracoes` | ❌ | Array de paths alterados (omitir se unchanged/skipped) |
| `erro` | ❌ | Se algo falhou |

---

### Orchestrator

#### orquestrador — Agent Delegation

Delegation payload sent to subagents:

```json
{
  "task": "description of work",
  "subagent_type": "pedreiro|revisor|explorador|...",
  "context": {
    "branch": "feat/TASK-1234",
    "base": "release",
    "files": ["src/file1.js", "src/file2.js"]
  }
}
```

> The orchestrator does not produce final user-facing JSON. Its output is the orchestration plan (which agent(s) to call, in what order/parallelism).

---

## Validation Rules

| Field | Rule |
|-------|------|
| `tipo` | Must be one of the allowed values for the agent |
| `erro` | If present, `motivo` SHOULD be included |
| `nivel_confianca` | Must be `alta`, `media`, or `baixa` |
| `alteracoes` | Array of strings, each describing a change |
| `veredito` (pr-insight) | Must be `approved`, `needs_changes`, or `blocked` |

> Orchestrator validates every subagent output against these contracts before proceeding.
> Validation script: `node .opencode/orchestrator/dist/index.js validate`

---

> Last updated: 2026-06-21
