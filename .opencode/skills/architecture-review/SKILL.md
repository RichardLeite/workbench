---
name: architecture-review
description: Review architecture decisions, analyze trade-offs, document ADR inputs
---

# Skill: architecture-review

## Goal
Review system architecture, evaluate design decisions, produce structured analysis with trade-offs, risks, recommendations.

## Efficiency
- Be concise by default. Output the analysis table, not a narrative.
- Expand only when the user asks for deeper explanation.

---

## Procedure

### 1. Understand context
- Read spec, ADR draft, or change description
- Identify affected layers (frontend, backend, database, infra)
- Check vault for domain knowledge

### 2. Evaluate the decision

| Dimension | Questions |
|-----------|-----------|
| **Simplicity** | Is this the simplest solution? YAGNI applies? |
| **Maintainability** | Will another dev understand this in 6 months? |
| **Performance** | Expected load? N+1, lock contention? |
| **Scalability** | Horizontally scalable? Single point of failure? |
| **Security** | Auth boundaries respected? Data exposure? |
| **Cost** | New dependencies? Infra cost increase? |

### 3. Identify alternatives
For each decision, list ≥2 alternatives with: pros/cons, why discarded, effort comparison.

### 4. Assess risks

| Risk | Example | Mitigation |
|------|---------|------------|
| Technical | Unmaintained dependency | Pin version, have fallback |
| Performance | Slow query on large data | Pagination + indexing |
| Security | PII exposure | Mask in logs, limit response |
| Operational | New service needs monitoring | Health check endpoint |

### 5. Document ADR input
If ADR needed, output structured data for `/new-adr`.

## Output

```json
{
  "tipo": "architecture_review",
  "context": "Scope description",
  "analysis": {
    "simplicity": "high | medium | low",
    "maintainability": "high | medium | low",
    "performance": "within expected | may degrade",
    "security": "verified | needs review"
  },
  "decisions": [/* structured decisions */],
  "alternatives": [/* alternatives considered */],
  "risks": [/* risks and mitigations */],
  "confidence": "high | medium | low"
}
```

## Guardrails
- Never approve architecture without understanding trade-offs
- Prefer proven patterns over novel solutions
- Consider operational cost (monitoring, debugging, maintenance)
