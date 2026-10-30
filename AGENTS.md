# AGENTS.md

You are a specialist software engineer working in a multi-project environment.
Each project has its own stack, license, conventions and process defined in the
`projects/` directory. Always identify the work context first.

## Multi-Project Structure

- **Shared (`.opencode/`)**: Rules, skills, commands, templates, agents and process engine.
- **Project-specific (`projects/<name>/`)**: `project.json`, knowledge, agents and optional project processes.
- **Project catalog (`.opencode/config/project-mapping.json`)**: Base catalog and explicit overrides.
- **Generated catalog (`.opencode/config/project-mapping.local.json`)**: Local discovery output; never edit by hand.
- **Processes (`.opencode/processes/`)**: User-defined flows with stages, gates, artifacts and agents.

## Project Discovery

Projects are discovered automatically from git checkouts in the workspace root
and in configured roots inside the workspace (`project-mapping.json#discovery.roots`
or `WB_PROJECT_ROOTS`). Metadata lives in `projects/<slug>/project.json`; if it is
absent, the name comes from `AGENTS.md` or the directory name. Multi-repo
projects declare `repos` roles in the manifest.

```bash
uv run --frozen python -m workbench projects scan
uv run --frozen python -m workbench projects sync
uv run --frozen python -m workbench projects list
```

The OpenCode plugin, the `wb` CLI and the Claude Code `SessionStart` hook refresh
the local catalog automatically. `opencode.json` references are generated in
memory, so do not register each repository manually. Use the repository name as
the `@reference` alias to avoid ambiguity.

> **Regra local-first portátil:** Antes de clonar, execute `uv run --frozen python -m workbench repo resolve --project <slug> [--repo <role>]`. Para `available`, use o checkout local. Para `missing`, clone somente o repositório necessário após confirmação explícita. Para `invalid_git`, nunca clone nem sobrescreva o path; reporte o estado e peça uma decisão.

## Process Resolution

1. Read `projects.<slug>.process` from the merged catalog (`wb projects list`; default: `default`).
2. Load the process with `wb process show <process>` / `wb process plan <process>`.
3. Follow stages in order, delegating to the defined agent.
4. Run gates with `wb process gate <process> <gate> --slug <slug>`.
5. Update state with `wb process state ...`.

Create a custom process with `wb process init <name>` and edit
`.opencode/processes/<name>/process.json`. Do not hardcode company-specific
flows in the orchestrator.

## Project Context

`projects/<slug>/project.json` supports:

```json
{
  "slug": "meu-projeto",
  "name": "Meu Projeto",
  "description": "Descrição curta",
  "repos": { "api": "meu-projeto-api" },
  "knowledge": "projects/meu-projeto/knowledge",
  "agents": ["backend-dev"],
  "vault": null,
  "process": "default",
  "license": "MIT",
  "tracker": "none"
}
```

## Rules (Non-Negotiable)

1. Never commit directly to protected branches (`main`, `release`).
2. Never approve or merge PRs via agent.
3. Every change must be reproducible, testable, evidence-backed.
4. No change without rollback strategy.
5. Specs and backlog updated as part of done criteria when the process requires it.
6. **Local repos first** — resolve runtime availability before cloning.
7. Respect the project license. Never copy code from an incompatible license.

## Commits

- `.workbench`: `type(workbench): description`
- `projects/<name>`: `type(scope): description`
- Types: `feat`, `fix`, `test`, `chore`, `docs`, `refactor`, `perf`

## Agents

- Generic agents in `.opencode/agents/` (core, development, review, decision, analysis, infrastructure, process).
- Project agents in `projects/<name>/agents/`.
- **Full catalog**: `.opencode/config/agent-registry.md`
- **Decision tree**: `.opencode/rules/decision-tree.md`
- Orchestrator decides which agent to call (process-driven).

## Skills

> Skills catalog: `.opencode/config/skills-catalog.md`

## Commands

| Command              | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| `/new-bug`           | New bug spec                                                       |
| `/new-feature`       | New feature proposal                                               |
| `/new-adr`           | New ADR draft                                                      |
| `/new-issue`         | New issue in repo                                                  |
| `/git-pr`            | Branch + pull request (generic)                                    |
| `/process`           | Run or manage a user-defined process                               |
| `/new-release`       | GitHub Release from a tag                                          |
| `/pr-template`       | Prepare PR with context                                            |
| `/checklist-release` | Release checklist                                                  |
| `/refinar`           | Refine ideas/tasks into artifacts                                  |
| `/execute-spec`      | Modular spec execution: TDD RED→GREEN, parallelism, auto-review    |
| `/review-all`        | 4-layer: Lint → SAST → Security → AI Review                        |
| `/metrics`           | Process metrics: cycle time, tokens, defects, coverage             |
| `/generate-docs`     | Auto-docs: README, API docs, vault                                 |
| `/pr-analyze`        | Analyze current PR: diff, context, impact, suggestions             |
| `/handoff`           | Gera contexto da sessão no chat para copiar/colar em nova sessão   |
| `/wiki`              | Search project vault (context-aware)                               |

### Optional Adapter

MySQL is disabled by default. Enable the MCP in `opencode.json` and fill `.env`
before using `/mcp-start`.

### Orchestrator

Uses the merged project catalog (`wb projects list`) and `.opencode/processes/`.
Agent contract validation: `python -m workbench process validate` (after build).
