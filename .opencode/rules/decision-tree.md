# Decision Tree

> Regras de roteamento do orquestrador. Fonte da verdade: `config/agent-registry.md` e `agent-catalog.json`.
> Use GOAP format ao delegar (ver `agents/core/orquestrador.md`).

## 0. Risk Classification

Classifique a tarefa antes de rotear:

### Low Risk (agente único, sem review)
- Read-only (consulta, grep, glob)
- Small corrections (typo, rename, format)
- Isolated UI changes (color, padding)
- Refactor sem mudança comportamental

### Medium Risk (plano curto + review opcional)
- Business rule change
- Integration (API externa, webhook)
- Database schema change (non-destructive)
- Simple auth (login, JWT)
- Deploy non-production
- Test addition/improvement

### High Risk (planner → implementer → review + security)
- Financial, fiscal, payment logic
- Auth/permissions/RBAC overhaul
- PII, LGPD, multi-tenant isolation
- Production deploy
- Destructive migrations (DROP)
- Security audit
- Breaking API contract changes

## 1. Route by Task Type

| Task | Primary Agent | Secondary |
|------|--------------|-----------|
| DISCOVERY | explorador | explore (quick) |
| CODE REVIEW (genérico) | code-reviewer | security-reviewer (se security) |
| CODE REVIEW (profundo) | revisor | tech-architect (se arquitetura) |
| CODE REVIEW (PR) | pr-insight | code-reviewer (se complexo) |
| SECURITY CODE REVIEW | security-reviewer | sec-arch (se design) |
| SECURITY DESIGN | sec-arch | tech-architect |
| SECURITY AUDIT (API/DB) | skills: security-audit-api/database | sec-arch |
| BUILD (genérico) | backend-dev / frontend-dev | pedreiro (se bem definido) |
| BUILD (bem definido) | pedreiro | — |
| BUILD (genérico) | backend-dev / frontend-dev | database-dev (se DB) |
| DATABASE (genérico) | database-dev | — |
| TEST PLAN | qa-engineer | — |
| PROCESS/SPRINT | scrum-master | business-analyst |
| REQUIREMENTS | business-analyst | product-manager |
| ADO TASKS | task-refiner-ado | gestor-tokens (se caro) |
| DEPLOY | devops-engineer | — |
| UX/VISUAL | ux-analyzer | image-analyzer |
| KNOWLEDGE VAULT | vault-updater | — |
| INTEGRATION STUDY | integracoes-power | vault-updater |
| PERFORMANCE AUDIT | perf-auditor | database-dev (se DB) |
| PLANNING (feature complexa) | planner | architect (se arquitetural) |
| ARCHITECTURE DESIGN | architect | tech-architect |
| TDD/TEST-FIRST | tdd-guide | qa-engineer |
| MULTI/COMPLEX | orquestrador (decompor) | planner (planejar) |
| AMBIGUITY/CONFLICT | arbitro | — |
| COST AUDIT | gestor-tokens | — |

## 2. Parallelism Rules

### Safe to parallelize (independent)
- explorador + database-dev (search + schema)
- backend-dev + frontend-dev (API + UI, contrato definido)
- explorador + image-analyzer (research + layout)
- scrum-master + business-analyst (process + requirements)
- qa-engineer + revisor (test plan + code review)
- sec-arch + tech-architect (security + architecture design)
- integracoes-power + explorador (integration + discovery)
- task-refiner-ado + gestor-tokens (tasks + cost audit)

### Must be sequential (dependent)
- explorador → revisor (findings before review)
- revisor → pedreiro (plan before exec)
- image-analyzer → frontend-dev (layout before UI)
- backend-dev → frontend-dev (API contract before frontend)
- tech-architect → sec-arch (design before security review)
- sec-arch → revisor (security gate before code review)
- qa-engineer → revisor (tests before review gate)

## 3. Escalation Chain

```
FAIL → re-delegate with more context → escalar para revisor → escalar para tech-architect → escalar para humano
```

## 4. Project-Specific Escalations

### BUILD task
1. explorador (discover existing code)
2. revisor (review plan if complex)
3. Agent from `project-mapping.json#projects.<slug>.agents`
4. qa-engineer (test if requested)
5. vault-updater (update vault if spec changed)

### ADO task
1. task-refiner-ado
2. gestor-tokens (if high-cost sprint)
3. revisor (escalate if MCP/logic error)

### SECURITY task
1. sec-arch (design-level STRIDE + LGPD)
2. If P0 → block, escalate tech-architect + arbitro
3. revisor (post-implementation code check)

### INTEGRATION task
1. integracoes-power (analysis)
2. vault-updater (document)
3. task-refiner-ado (create ADO tasks)
4. revisor (complex logic)

## 5. Quality Gates by Risk

| Risk | Required Gates |
|------|---------------|
| Low | Output validation |
| Medium | Output validation + review (optional) |
| High | Plan review + security review + output validation + vault update |
