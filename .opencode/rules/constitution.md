# Constitution — Engineering Quality Laws

Non-negotiable rules for `.workbench` and all projects.

## Non-Negotiable Rules

1. Never commit directly to protected branches (`main`, `release`).
2. Never approve or merge PRs via agent.
3. Every implementation starts by identifying work context (`.workbench` | `projects/<name>`).
4. Every change must be reproducible and testable.
5. Every relevant decision must have evidence and, when necessary, an ADR.
6. No change without rollback strategy.
7. Respect the project license; never copy code from an incompatible license.
8. Never expose secrets; `.env` and credentials stay out of source control.
9. Specs and backlog updated when the project process requires it.
10. Follow the process defined in `.opencode/processes/<name>/process.json`.

## Git & Branch Rules

> All Git, branch, commit and PR rules are centralized in `.opencode/config/pr-config.md`.

## Mandatory Kickoff

1. If the context is not informed, ask which project/context.
2. Read the merged catalog and the project process.
3. Then start the work.
