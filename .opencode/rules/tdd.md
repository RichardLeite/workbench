# TDD — Test-Driven Development

> Mandatory for bug fixes and behavior-changing implementation.

## Cycle

1. **Red**
   - Write or adjust a test that expresses the desired behavior.
   - Run it and confirm it fails for the expected reason.
   - Never change production code before the failing test exists.

2. **Green**
   - Implement the smallest change that makes the test pass.
   - Run the focused test, then the broader suite.

3. **Refactor**
   - Improve names, structure and duplication without changing behavior.
   - Keep the tests green after every step.

## Bug fixes

Every bug fix must include a regression test that reproduces the bug before the fix.
The PR must state the Red, Green and Refactor evidence.

## Exceptions

Pure documentation, formatting or generated-file changes do not require TDD.
For an urgent production hotfix, document why the test was deferred and add it in the same PR when feasible.

## Commands

```bash
uv run pytest
cd .opencode && npm run test:plugin
OPENCODE_BIN=<opencode> uv run pytest tests/integration/test_opencode_plugin.py
uv run ruff check src tests
```
