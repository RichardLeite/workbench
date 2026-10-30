# AGENTS.md

You are a specialist software engineer working in a multi-project environment.
Each project has its own stack, conventions and rules defined in the
`projects/` directory. Always identify the work context first and consult the
project-specific `AGENTS.md` when the context is `projects/<name>`.

## Multi-Project Structure

- **Shared (`.opencode/`)**: Rules, skills, commands, templates and generic agents
- **Project-specific (`projects/<name>/`)**: Knowledge (backlog, specs, bugs) and project agents. Code repos are at workbench root.
- **Project catalog (`.opencode/config/project-mapping.json`)**: Central registry of all projects, their repos, knowledge paths, and compatible agents.

## @ References (Project Discovery)

Register each project repository in `opencode.json` → `reference` and in
`project-mapping.json`. Then reference it by name:

```json
"reference": {
  ".workbench": { "path": "." },
  "my-api": { "path": "my-api" }
}
```

> **Regra:** use o nome do repositório como @reference para evitar ambiguidade.

> **Regra local-first portátil:** Antes de clonar, execute `node .opencode/scripts/repository-resolver.js --project <slug> [--repo <role>]`. Para `available`, use o checkout local. Para `missing`, clone somente o repositório necessário após confirmação explícita. Para `invalid_git`, nunca clone nem sobrescreva o path; reporte o estado e peça uma decisão.

## Mapa de Contextos (project-mapping.json)

Consulte `.opencode/config/project-mapping.json` para o catálogo completo com:

- Nome e descrição do projeto
- Repositórios associados
- Path de knowledge
- Agentes compatíveis
- Disponibilidade dinâmica via `.opencode/scripts/repository-resolver.js`

## Initial Routing

Start every conversation by identifying the context: `.workbench` or one of the
projects registered in `.opencode/config/project-mapping.json`.

### `.workbench`

- Meta-project que gerencia os demais projetos. Estrutura em `.opencode/` + `projects/`
- Flow: branch from `main`, no TASK prefix, open PR to `main`

### `projects/<name>` (registered in project-mapping.json)

1. Read `projects/<name>/AGENTS.md`
2. Read backlog + specs
3. Apply project's kickoff and flow
4. Use project-mapping.json for path resolution (knowledge, checkpoints)

> **New project?** Use `/new-project` to scaffold the entire structure automatically.

### Unregistered project

If the project is not in `project-mapping.json`, treat as `.workbench` context and suggest running `/new-project`.

## Rules (Non-Negotiable)

1. Never commit directly to protected branches (`main`, `release`)
2. Never approve or merge PRs via agent
3. Every change must be reproducible, testable, evidence-backed
4. No change without rollback strategy
5. Specs and backlog updated as part of done criteria
6. **Local repos first** — resolve runtime availability before cloning and follow the `available`, `missing`, and `invalid_git` rules above.

## Commits

- `.workbench`: `type(workbench): description`
- `projects/<name>`: `type(TASK): description`
- Types: `feat`, `fix`, `test`, `chore`, `docs`, `refactor`, `perf`

## Agents

- Generic agents in `.opencode/agents/` (categorized: core, review, development, decision, analysis, infrastructure, process)
- Project agents in `projects/<name>/agents/`
- **Full catalog**: `config/agent-registry.md`
- **Decision tree**: `rules/decision-tree.md`
- Orchestrator decides which agent to call (GOAP format, see `agents/core/orquestrador.md`)

## Skills

> Skills catalog: see `.opencode/config/skills-catalog.md`

## Commands

| Command              | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| `/new-bug`           | New bug spec                                                       |
| `/new-feature`       | New feature proposal                                               |
| `/new-adr`           | New ADR draft                                                      |
| `/new-issue`         | New issue in repo                                                  |
| `/git-sprint`        | Sprint: quality gates → branch → commit → PR                       |
| `/git-hotfix`        | Hotfix: security gates → 2 branches → 2 PRs                        |
| `/new-release`       | Release: pre-flight → wizard → GitHub Release                      |
| `/pr-template`       | Prepare PR with context                                            |
| `/checklist-release` | Release checklist                                                  |
| `/checklist-hotfix`  | Hotfix checklist                                                   |
| `/refinar`           | Refine ideas/tasks into artifacts                                  |
| `/pipeline`          | SDD Pipeline: spec → validation → TDD → implementation → review → vault |
| `/execute-spec`      | Modular spec execution: TDD RED→GREEN, parallelism, auto-review    |
| `/review-all`        | 4-layer: Lint → SAST → Security → AI Review                        |
| `/metrics`           | Process metrics: cycle time, tokens, defects, coverage             |
| `/generate-docs`     | Auto-docs: README, API docs, vault                                 |
| `/pr-analyze`        | Analyze current PR: diff, context, impact, suggestions             |
| `/handoff`           | Gera contexto da sessão no chat para copiar/colar em nova sessão   |
| `/wiki`              | Search project vault (context-aware)                               |

### Optional Adapters

Azure DevOps, Teams and MySQL are disabled by default. Enable the MCP in
`opencode.json` and fill `.env` before using adapter-specific commands/agents.

### Orchestrator

Uses the complete catalog in `orquestrador.md` to decide which agent to call.
Agent contract validation: `node .opencode/orchestrator/index.js validate` (after build).
