---
description: Draft PR using context template
agent: plan
---
Before drafting, ask this mandatory gate:
- Which context is this PR for: `.workbench`, known project, or other project?

> **Regras centralizadas em: `.opencode/config/pr-config.md`**
> - Seção 1: Branch rules (base, target, patterns)
> - Seção 2: PR title format
> - Seção 3: PR body template (template único)

If the context is `.workbench`:
- prepare one PR targeting `main`

If the context is `projects/<nome>`:
- ask whether the flow is `RELEASE` or `HOTFIX`
- if `RELEASE`: prepare one PR targeting `release`
- if `HOTFIX`: prepare two PRs:
  1. hotfix branch -> `main`
  2. backport branch (same name + `-release`, created from `release`, with cherry-picked commits) -> `release`

Fill all sections of the PR body template (pr-config.md Seção 3) with the context of this branch and changes.
Keep placeholders only when data is truly unavailable.
Always include: `I did not approve/merge this PR`.
