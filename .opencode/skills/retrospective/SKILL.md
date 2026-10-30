---
name: retrospective
description: Sprint retrospective — gather metrics, identify patterns, generate action items
---

# Skill: retrospective

## Goal
Analyze sprint data, identify improvement opportunities, generate actionable retro items.

## Efficiency
- Be concise by default. Output findings and action items directly.
- Expand only when the user asks for details.

---

## Procedure

### 1. Gather sprint metrics
Collect from Azure DevOps:
- **Velocity**: completed SP vs planned SP
- **Bug rate**: opened vs closed
- **Lead time**: avg from dev start to deploy
- **WIP**: avg work in progress
- **Scope**: mid-sprint changes

### 2. Analyze patterns

| Pattern | Signal | Action |
|---------|--------|--------|
| 🔴 Overcommit | Planned > 120% avg velocity | Cut scope earlier |
| 🟡 Scope creep | >20% items added mid-sprint | Improve refinement |
| 🟢 Healthy | 90-110% velocity, few bugs | Keep doing what works |
| 🔴 Bug influx | Bugs > 30% of total work | Address tech debt |

### 3. Generate retro items

Start/Stop/Continue format:

| Type | Description | Owner |
|------|-------------|-------|
| **Start** | New practice to adopt | Team |
| **Stop** | Practice hurting team | Team |
| **Continue** | Practice working well | Team |

### 4. Prioritize action items
Each item must have: **owner**, **deadline**, **metric** to measure success.

### 5. Link to backlog
- Add to `projects/meu-projeto/knowledge/backlog/01-tech-debt.md`
- Or create Azure task

## Output

```json
{
  "tipo": "retrospective",
  "sprint": "Sprint 05-2026",
  "metrics": {
    "planned_velocity": 42,
    "delivered_velocity": 38,
    "bugs": { "opened": 4, "closed": 3 },
    "avg_lead_time_days": 3.5,
    "scope_added": 2
  },
  "start": ["Run refinement 2x/week"],
  "stop": ["Start tasks without owner defined"],
  "continue": ["Mandatory code review"],
  "action_items": [
    {
      "action": "Add QA checklist to PR template",
      "owner": "Tech Lead",
      "deadline": "2026-06-18",
      "metric": "Checklist filled on 100% of PRs"
    }
  ]
}
```

## Guardrails
- Metrics first, opinions second
- Max 5 action items
- Balance positive and negative
- Never assign items without team agreement
- Be concise: output findings, don't narrate process
