---
name: bugfix
description: Fix bug with minimal, auditable impact
---

# Skill: bugfix

## Goal
Fix bugs with minimal, auditable impact.

## Efficiency
- Be concise by default. Reproduce, fix, verify — no verbose narrative.
- Expand details only when the user asks.

---

## Procedure
1. Reproduce bug, document steps
2. Add failing test first (unit/integration/e2e when feasible)
3. Implement minimal fix
4. Run affected tests + regression checks
5. Collect evidence: failing test output → passing test output → changed path
6. Update backlog/spec if behavior contract changed

## Mandatory rollback template
```markdown
### Rollback
1. Revert commit: `git revert <SHA>`
2. If migration: `yarn run-migrate:rollback`
3. Redeploy: `pm2 restart <service>`
4. Verify: health check + affected functionality
```

## Post-fix verification checklist
- [ ] Bug reproduced before fix (evidence: log/screenshot)
- [ ] Test added that failed before and passes now
- [ ] Regression tests on affected areas pass
- [ ] Rollback documented

## Guardrails
- Do not refactor unrelated code
- Keep commits granular by intention
- Keep the patch strictly scoped
- Always verify fix in staging-like env before production
