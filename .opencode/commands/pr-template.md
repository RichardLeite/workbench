---
description: Draft PR using context template
agent: plan
---
Before drafting, ask this mandatory gate:
- Which context is this PR for: `.workbench`, known project, or other project?

> **Regras centralizadas em: `.opencode/config/pr-config.md`**
> - Seção 1: Branch rules
> - Seção 2: PR title format
> - Seção 3: PR body template

If the context is `.workbench`:
- prepare one PR targeting `main`

If the context is `projects/<nome>`:
- read the project process and `wb projects list`
- prepare one PR targeting the project base branch
- if the project process defines multiple branches (ex: release), follow the process

Fill all sections of the PR body template (pr-config.md Seção 3) with the context
of this branch and changes. Keep placeholders only when data is truly unavailable.

Always include: `I did not approve/merge this PR`.
