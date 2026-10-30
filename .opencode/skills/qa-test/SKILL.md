---
name: qa-test
description: Generate test plans, test cases, regression strategies, and validation scenarios
---

# Skill: qa-test

## Goal
Generate concise test plans from specs — test cases, regression strategy, acceptance validation.

## Efficiency
- Be concise by default. Output the plan directly without verbose explanation.
- Expand details only when the user asks.

---

## Procedure

### 1. Analyze the spec
Read spec, identify:
- Core functionality
- Acceptance criteria (primary test scenarios)
- Edge cases and error states
- Integration points

### 2. Design test strategy

| Level       | Scope                    | Technique                  |
| ----------- | ------------------------ | -------------------------- |
| Unit        | Functions/classes        | White-box, coverage targets|
| Integration | API endpoints, services  | Contract, request/response |
| E2E         | Critical user flows      | UI automation (Playwright) |
| Regression  | Existing features        | Smoke suite + impacted     |

### 3. Generate test cases

Each test case:
```json
{
  "id": "TC-001",
  "title": "Clear scenario description",
  "precondition": "Required state before execution",
  "input_data": { "param1": "value1" },
  "steps": ["Detailed step 1", "Detailed step 2"],
  "expected_result": "Expected behavior after execution",
  "type": "functional | regression | edge | error | performance"
}
```

### 4. Risk-based prioritization

| Priority | Criterion                | Action                    |
| -------- | ------------------------ | ------------------------- |
| P0       | Business blocking        | Test on all environments  |
| P1       | Core functionality       | Test before deploy        |
| P2       | Secondary functionality  | Test if time permits      |
| P3       | Cosmetic / Improvement   | Test on demand            |

### 5. Regression checklist
- [ ] Auth flow / login
- [ ] Basic CRUD on affected entities
- [ ] Linked reports
- [ ] Integrations (NF-e, NFS-e, Banking)
- [ ] Performance (response < 3s)

## Output

```json
{
  "tipo": "test_plan",
  "feature": "Feature Name",
  "strategy": "Unit + Integration + E2E",
  "cases": [/* array of test cases */],
  "regression": ["Smoke: 5 critical tests"],
  "risks": ["Performance on table with 10k records"],
  "coverage": "~85% of branches"
}
```

## Guardrails
- Never test without documented expected behavior
- Always include ≥1 error scenario per feature
- Regression must cover at least critical user flows
- Be concise: output the plan, not a narrative
