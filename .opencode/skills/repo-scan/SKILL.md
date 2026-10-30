---
name: repo-scan
description: Create objective inventory of api/app for decision-making.
---

## Goal
Create objective inventory of api/app for decision-making.

## Procedure
1. Collect branch state (`git branch --list`).
2. Map stack (`package.json`, env configs, scripts).
3. Detect risky files (`*.pfx`, secrets, logs with PII, uploads in git).
4. Count tests and migration assets.
5. Capture TODO/FIXME hotspots.
6. Register evidence in:
   - `specs/00-repo-map.md`
   - `backlog/00-backlog.md`
   - `backlog/03-prioritization.md`

## Dependency analysis

### 6. Audit dependencies

```bash
# Check for known vulnerabilities
npm audit --production

# Check outdated packages
npm outdated

# Identify large/unused dependencies
npx depcheck
```

### 7. Analyze dependency health

| Criteria | What to check |
|---|---|
| **Version freshness** | How many major versions behind? |
| **Maintenance status** | Last commit > 1 year? Abandoned? |
| **Vulnerability count** | `npm audit` severity levels |
| **Bundle size** | Can we tree-shake or replace? |
| **License compatibility** | GPL in commercial project? |

Record findings in:
- `backlog/01-tech-debt.md`
- New tech debt items with P1/P2 priority

## Output
- Repo map updated with paths.
- Backlog entries with P0/P1/P2.
- Risks linked to evidence paths.
- Dependency health report with known vulnerabilities.
- Tech debt items for deprecated/risky packages.
