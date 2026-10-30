# Tech Debt Rule

> **Mandatory for ALL agents.** Whenever you encounter technical debt during any task, you MUST ask the user if they want to open a GitHub issue.

## What qualifies as tech debt

| Category | Examples |
|----------|----------|
| **TODO/FIXME** | `// TODO: refactor this`, `/* FIXME: handle edge case */` |
| **Workarounds** | `// workaround for bug in library X`, hacks, temporary fixes |
| **Pattern violations** | Code that breaks CONVENTIONS.md without justification |
| **Dead code** | Commented code, unused imports/variables, deprecated endpoints |
| **No tests** | Critical logic without test coverage |
| **Security smell** | Exposed secrets, missing validation, SQL injection risk |
| **Performance issue** | N+1 queries, missing indexes, large payloads without pagination |
| **Hardcoded config** | Magic numbers, hardcoded URLs, environment-specific values |

## Trigger condition

- During code review, implementation, exploration, or any file read
- If you find ANY of the above, **pause and ask the user** via `question` tool:

```
🔧 Dívida técnica encontrada em `{caminho/do/arquivo}:{linha}`:
   {descrição}

Deseja abrir uma issue para corrigir posteriormente?
```

## If user says yes

1. Identify the **origin repo** (where the file lives):
   - `meu-projeto-api/` → `API`
   - `meu-projeto-app/` → `APP`  
   - `.workbench/` → `WORKBENCH`
   - etc. (see `.opencode/config/repo-mapping.json`)
2. Use the script to create the issue:

```bash
uv run --frozen python -m workbench issue tech-debt "<repo-name>" "<Título conciso>" "Arquivo: {caminho}:{linha}\n\n{descrição detalhada}\n\nDescoberto durante: {contexto da tarefa}"
```

3. Report back the issue URL to the user.

## If user says no

Just log a note and continue. Do not insist.

## Rules

1. **Always ask first** — never open issues without user approval.
2. **Issue in origin repo** — never open tech debt issues in `.workbench` for code that lives in `meu-projeto-api`.
3. **Be concise** — title max 60 chars, body max 500 chars.
4. **Label** — issues are created with `tech-debt` label automatically.
5. **Not a replacement for bugs** — if it's a bug being fixed NOW, don't open a separate issue.
