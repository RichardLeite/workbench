# Task Plan: [Task Name]

> Generated: YYYY-MM-DD
> Status: Draft | In Progress | Complete

## Objective
One sentence describing what this task accomplishes.

## Scope
### In scope
- What will be done
- Files to create/modify
- Tests to add

### Out of scope
- What will NOT be done (deliberately excluded)

## Steps

### Phase 1: Preparation
- [ ] Step 1.1 — Understand existing codebase (read relevant files)
- [ ] Step 1.2 — Set up test infrastructure if needed
- [ ] Step 1.3 — Confirm approach with user

### Phase 2: Implementation
- [ ] Step 2.1 — [File/Module]: [Description of change]
  - Completion criteria: [what proves this is done]
- [ ] Step 2.2 — [File/Module]: [Description of change]
  - Completion criteria: [what proves this is done]

### Phase 3: Validation
- [ ] Step 3.1 — Run tests
- [ ] Step 3.2 — Manual verification (if applicable)
- [ ] Step 3.3 — Check for regressions

### Phase 4: Cleanup
- [ ] Step 4.1 — Remove debug code, console.log, TODO markers
- [ ] Step 4.2 — Update documentation if needed
- [ ] Step 4.3 — Summarize results to user

## Dependencies
- **Files**: `src/services/X.js`, `src/controllers/Y.js`
- **Services**: Database running, Redis available
- **Data**: Test fixtures or seed data

## Risks
| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|:------:|------------|
| Existing code may not match docs | Medium | High | Read actual code, not spec |
| Migration may lock table | Low | High | Run during low traffic, use timeout |
| External API rate limit | Medium | Medium | Cache responses, handle 429 |

## Rollback Plan
- Git: `git revert <commit>` or checkout previous commit
- Database: Migration rollback (`db:migrate:undo`)
- Config: Restore previous env vars or feature flags
