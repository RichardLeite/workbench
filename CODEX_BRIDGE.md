# Codex CLI Bridge — Regras e Routing

> Bridge do OpenCode para Codex CLI. Complementa `AGENTS.md` com regras consolidadas e routing GOAP.
> Mantenha sincronizado com `.opencode/rules/`, `CONVENTIONS.md` e `opencode.json`.

---

## Constitution — Non-Negotiable Rules

1. Never commit directly to protected branches (`main`, `release`)
2. Never approve or merge PRs via agent
3. Every implementation starts by identifying work context (`.workbench` | `projects/<name>`)
4. Every code change must be reproducible and testable
5. Every relevant decision must have evidence
6. No change without rollback strategy
7. No P1 while P0 is open; no P2 while P1 is open
8. Hotfix must minimize scope and avoid parallel refactoring
9. Backport must preserve functional equivalence
10. Specs and backlog must be updated as part of done criteria
11. **Notification Guard-Rail**: no external message without explicit user approval

## Code Conventions

### Naming

| Element | Pattern | Example |
|---------|---------|---------|
| Classes | PascalCase | `CustomerController` |
| Functions | camelCase | `findByEmail()` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Booleanos | is/has/should prefix | `isActive`, `hasPermission` |
| Endpoints | snake_case plural | `/api/v2/clientes` |
| Route params | camelCase | `/:clienteId` |
| Query params | snake_case | `?data_inicio=` |
| Body fields | camelCase | `{ clienteNome }` |
| Files | PascalCase (components), camelCase (utils) | `CustomerForm.tsx`, `formatCurrency.ts` |
| Dirs | kebab-case | `contas-a-receber/` |

### Import Order
1. Node built-ins
2. External packages
3. Internal aliases (@/)
4. Relative imports (./)
5. Types/interfaces

### API Response Format

**Success:**
```json
{ "data": { ... }, "pagination": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 } }
```

**Error:**
```json
{ "error": { "code": "CUSTOMER_NOT_FOUND", "message": "Cliente não encontrado", "details": { "customerId": 1234 } } }
```

### HTTP Error Codes

| HTTP | Code | Use |
|:----:|------|-----|
| 400 | VALIDATION_ERROR | Invalid data |
| 401 | UNAUTHORIZED | Missing/invalid token |
| 403 | FORBIDDEN | No permission |
| 404 | RESOURCE_NOT_FOUND | Not found |
| 409 | CONFLICT | Duplicate, stale version |
| 422 | UNPROCESSABLE_ENTITY | Business rule violation |
| 500 | INTERNAL_ERROR | Unexpected error |

## Task Routing (GOAP)

Classify risk first: **Low** (<3 steps) → **Medium** (3-7, review optional) → **High** (>7, financial/auth, security mandatory)

| Task | Agent |
|------|-------|
| DISCOVERY | `explorador` / `explore` |
| CODE REVIEW | `revisor` / `code-reviewer` / `pr-insight` |
| SECURITY REVIEW | `security-reviewer` / `sec-arch` |
| BUILD (generic) | `backend-dev` / `frontend-dev` / `pedreiro` |
| BUILD (well-defined) | `pedreiro` |
| DATABASE | `database-dev` |
| TEST PLAN | `qa-engineer` |
| SPRINT/PROCESS | `scrum-master` |
| REQUIREMENTS | `business-analyst` |
| ADO TASKS | `task-refiner-ado` |
| DEPLOY | `devops-engineer` |
| VAULT UPDATE | `vault-updater` |
| INTEGRATION STUDY | `integracoes-power` |
| PERFORMANCE | `perf-auditor` |
| ARCHITECTURE | `architect` / `tech-architect` |
| TDD | `tdd-guide` |
| AMBIGUITY/CONFLICT | `arbitro` |
| COST AUDIT | `gestor-tokens` |

## Custom Agents (`.codex/agents/*.toml`)

| Agent | Purpose | Model |
|-------|---------|-------|
| `pedreiro` | Fast implementation, well-defined | gpt-5.3-codex-spark medium |
| `revisor` | Code review (read-only) | gpt-5.4 high |
| `pr-insight` | PR analysis + GitHub + Teams | gpt-5.4 high |
| `explorador` | Codebase search (read-only) | gpt-5.3-codex-spark medium |

## MCP Servers (in `~/.codex/config.toml`)

- `mcp-image` — image I/O e análise (ativo por padrão)
- `azure-devops` — Work items, queries (adapter opcional)
- `teams-graph` — Send Teams messages via Graph API (adapter opcional)
- `mysql` — MySQL queries (adapter opcional)

## Project Context

Cada projeto declara stack, repositórios e convenções no próprio `AGENTS.md`.
Consulte `.opencode/config/project-mapping.json` para o catálogo.
