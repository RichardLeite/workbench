---
name: complex-task-planner
description: Manus-style file-based planning for complex tasks. Creates task_plan.md, findings.md, progress.md for tracking multi-step work. Use for tasks requiring >5 tool calls.
category: development
---

# Complex Task Planner

## Goal
Plan and track complex multi-step tasks using file-based artifacts — `task_plan.md`, `findings.md`, `progress.md` — for transparent, resumable execution.

## When to use
- Tasks requiring >5 tool calls or spanning >30 minutes
- Multi-file refactoring or feature implementation
- Research or investigative tasks with unknowns
- Any task where you need to **pause and resume** without losing context

## Procedure

### 1. Create Task Plan
Create `task_plan.md` in the working directory:
- **Objective**: one sentence describing the goal
- **Steps**: numbered list of steps with clear completion criteria
- **Dependencies**: files, services, or data required
- **Risk**: what could go wrong and fallback plan

### 2. Create Findings
Create `findings.md` to record discoveries:
- As you explore code, SQL, or logs, log interesting observations
- Note patterns, anti-patterns, and architectural decisions encountered
- Save queries, URLs, and file paths for future reference

### 3. Create Progress
Create `progress.md` and update after each step:
- Mark each step as `[ ]` or `[x]`
- Note any deviations from plan
- Record timestamps for long-running operations
- Log test results and validation evidence

### 4. Execute
- Work through the plan one step at a time
- Update `progress.md` after each completed sub-step
- If blocked: pause, document in `findings.md`, and ask user

### 5. Finalize
- Mark all steps complete in `progress.md`
- Archive the plan files if needed (or keep for audit trail)
- Summarize results to user

## Template usage

```bash
# Initialize a new task
cp .opencode/skills/complex-task-planner/references/templates/*.md ./my-task/
```

## Output
- `task_plan.md` — The structured plan
- `findings.md` — Discoveries and observations
- `progress.md` — Execution status and evidence

## References
- [Task Plan Template](references/templates/task_plan.md)
- [Findings Template](references/templates/findings.md)
- [Progress Template](references/templates/progress.md)
