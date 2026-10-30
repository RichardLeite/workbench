---
name: release-management
description: Coordinate releases — versioning, deploy checklist
---

# Skill: release-management

## Goal
Coordinate software releases: versioning, deploy readiness.

## Efficiency
- Be concise by default. Show the checklist, don't narrate it.
- Expand only when the user asks for details.

---

## Procedure

### 1. Identify release scope
```bash
git log PREVIOUS_TAG..HEAD --oneline
git diff PREVIOUS_TAG..HEAD --stat
```

Categorize: `feat` → minor, `fix` → patch, `BREAKING CHANGE` → major.

### 2. Pre-release checklist
- [ ] All PRs merged to `release` branch
- [ ] Tests pass (`yarn test`)
- [ ] Lint passes (`yarn lint`)
- [ ] Migration scripts reviewed
- [ ] Tag created: `git tag v2.5.0 && git push --tags`
- [ ] GitHub release notes published

### 3. Deploy readiness
| Item | Status |
|------|--------|
| Staging deploy | ✅/❌ |
| Health check | ✅/❌ |
| Migration run | ✅/❌ (or N/A) |
| Smoke tests | ✅/❌ |
| Rollback plan | ✅/❌ |

### 4. Post-release
- [ ] Monitor metrics (error rate, latency) for 1h
- [ ] Notify team
- [ ] Update backlog items to "Done"

## Output

```json
{
  "tipo": "release_plan",
  "version": "v2.5.0",
  "features": 3,
  "fixes": 5,
  "commits": 24,
  "checklist": {
    "tests": true,
    "migrations": false,
    "rollback_documented": true,
  },
  "risks": ["5-min migration might timeout"],
  "commands": ["git tag v2.5.0", "git push --tags"]
}
```

## Guardrails
- Tags follow semver (MAJOR.MINOR.PATCH)
- Breaking changes → major version bump
- Always verify rollback before production deploy
