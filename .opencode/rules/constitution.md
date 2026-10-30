# Constitution — Engineering Quality Laws

Non-negotiable rules for `.workbench` and all projects.

## Non-Negotiable Rules

1. Never commit directly to protected branches (`main`, `release`)
2. Never approve or merge PRs via agent
3. Every implementation starts by identifying work context (`.workbench` | `projects/<name>`)
4. Every code change must be reproducible and testable
5. Every relevant decision must have evidence and, when necessary, ADR
6. No change without rollback strategy
7. No P1 while P0 is open; no P2 while P1 is open
8. Hotfix must minimize scope and avoid parallel refactoring
9. Backport must preserve functional equivalence
10. Specs and backlog must be updated as part of done criteria
11. **Teams Guard-Rail**: no Teams message without explicit user approval. See `teams-guard-rail.md`.

## Git & Branch Rules

> **All Git, branch, commit, and PR rules are centralized in `.opencode/config/pr-config.md` (Seções 1 — BRANCH RULES, 10 — CONVENTIONAL COMMITS, 11 — CONVENTIONAL BRANCHES). Consult that file for complete rules.**

## Mandatory Kickoff

1. If not informed → ask which context.
2. If `.workbench` → follow repo's own flow.
