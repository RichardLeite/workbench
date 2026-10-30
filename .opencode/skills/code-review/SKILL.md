---
name: code-review
description: Formal code review — diff analysis, checklist, improvement suggestions
---

# Skill: code-review

## Goal
Perform structured code reviews: correctness, style, security, performance.

## Efficiency
- Be concise by default. List findings, don't narrate.
- Expand only when the user asks for deeper explanation.

---

## Procedure

### 1. Analyze the diff
```bash
git diff BASE..HEAD --stat
git diff BASE..HEAD
```

Identify:
- **Structural**: new files, renames, architecture impact
- **Logic**: core business rules, calculations
- **Risk**: auth, data mutation, SQL, external calls

### 2. Apply checklist

#### Correctness
- [ ] Logic matches spec/acceptance criteria
- [ ] Error handling covers expected failures
- [ ] Edge cases covered (null, empty, invalid)
- [ ] Data validation on boundaries

#### Security
- [ ] No hardcoded secrets/tokens
- [ ] Input sanitized (SQL injection)
- [ ] Auth guards on new endpoints
- [ ] PII masked in logs

#### Performance
- [ ] No N+1 queries (ORM usage)
- [ ] Pagination on listings
- [ ] Indexes for new query patterns
- [ ] No avoidable loops/redundant calls

#### Maintainability
- [ ] Code follows project conventions (v1/v2)
- [ ] Meaningful names
- [ ] No dead code/commented blocks
- [ ] Tests accompany new logic

### 3. Classify findings

| Label | Impact | Action |
|-------|--------|--------|
| 🔴 CRITICAL | Security, data loss, wrong logic | Must fix before merge |
| 🟡 MAJOR | Performance, maintainability | Should fix |
| 🔵 MINOR | Style, naming, optional | Consider |
| 💡 SUGGESTION | Nice-to-have | Discuss only |

### 4. Write review
Per finding: file:line, what, why, concrete suggestion (code snippet when applicable).

## Output

```json
{
  "tipo": "code_review",
  "files_reviewed": 5,
  "verdict": "approved | changes_requested | comment",
  "findings": [
    {
      "severity": "major",
      "file": "src/controllers/SalesController.js:42",
      "problem": "Problem description",
      "impact": "Why this matters",
      "suggestion": "Code or fix description"
    }
  ],
  "summary": "Overall assessment of changes"
}
```

## Guardrails
- Be objective, not personal — review code, not the author
- Each finding must be actionable
- Critical issues block merge; suggestions don't
- If unsure, ask clarifying questions before approving
