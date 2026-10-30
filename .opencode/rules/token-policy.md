# Token Policy

> Política de economia de tokens. Aplicada por `gestor-tokens` e orquestrador.

## Model Tiering

| Complexity | Model | When |
|-----------|-------|------|
| Trivial | Fast/cheap | Grep, glob, read, simple edit |
| Simple | Fast/cheap | Bugfix bem definido, pequena mudança |
| Moderate | Medium | Feature por spec, escrever testes |
| Complex | Strong | Multi-layer feature, nova arquitetura |
| Critical | Strong | Security audit, P0 incident |

## Context Budget

| Agent Type | Max Context | Notes |
|-----------|------------|-------|
| Orchestrator | ~3KB + rules | Always-in-context |
| Core agents | ~8KB | planner, tech-architect |
| Expert agents | ~6KB | perf-auditor, business-analyst |
| Reviewer | ~4KB | revisor, code-reviewer, security-reviewer |
| Implementer | ~2KB | pedreiro, build tasks |

## Token Guard Rules

1. **Detect bloated prompts**: >30% of context is boilerplate → compact
2. **Compress before delegate**: Summarize context, remove history
3. **No unnecessary reads**: Don't read files not needed for the task
4. **Limit parallel agents**: Max 3 strong agents in parallel
5. **Short output format**: JSON or bullet points, no prose
6. **Kill duplicate context**: Don't repeat what's already in system prompt
7. **Session pruning**: Trim old messages from conversation when >50

## GOAP Format by Risk

### Simple task (<3 steps, low risk)
```
Route: <agent> | Why: <1-line reason>
```

### Medium task (3-7 steps, medium risk)
```
Goal: <objective>
Agent: <agent>
Reason: <1-line>
Risk: <low|medium|high>
Output: <expected>
```

### Complex task (>7 steps or high risk)
```
Goal: <objective>
Context: <relevant notes>
Constraints: <limitations>
Agents: <list>
Plan: <steps>
Risks: <list>
Validation: <how to verify>
Learning candidate: <what to save>
```

Full GOAP only for complex or high-risk tasks.

## Cost-Saving Heuristics

1. **Parallel before sequential** — two agents in parallel cost ~same tokens as one doing both
2. **Reuse context** — when multiple small tasks share context, batch in one delegation
3. **Escalate progressively** — start with cheaper agent, escalate only if it fails
4. **Audit expensive tasks** — when delegating to revisor or tech-architect, consider if truly needed
5. **Consult gestor-tokens** — if unsure about agent selection
