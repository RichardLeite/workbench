---
name: playwright-testing
description: E2E testing with Playwright — Page Objects, cross-browser, CI/CD integration, decision tree for testing approach. Use when writing or reviewing E2E tests.
category: development
---

# Playwright Testing

## Goal
Design and implement robust E2E tests with Playwright using Page Object pattern, cross-browser configuration, and CI/CD integration.

## When to use
- Writing or reviewing E2E tests
- Asked "how should I test this flow?" or "add E2E coverage"
- Setting up Playwright for a new project
- Debugging flaky E2E tests

## Decision Tree

```
Is the scenario a user-facing flow?
├── No → Is it a single function/component?
│   ├── Yes → ❌ Not E2E. Write unit test instead
│   └── No → Is it an API interaction?
│       ├── Yes → ❌ Not E2E. Write API/integration test
│       └── No → Consider if E2E is overkill
└── Yes → Is a server/browser required?
    ├── No → ❌ Not E2E. Unit or integration test suffices
    └── Yes → Is it a critical user journey?
        ├── No → Can it be covered by integration test?
        │   ├── Yes → ❌ Use integration test (faster)
        │   └── No → ✅ E2E test. Proceed with Playwright
        └── Yes → ✅ E2E test. Proceed with Playwright
```

## Procedure

### 1. Project Setup
```bash
npm init playwright@latest
# Choose: TypeScript, tests/ directory, GitHub Actions
```

Configure in `playwright.config.ts`:
- `testDir`, `timeout`, `retries` (2 for CI)
- `use.baseURL`, `use.viewport`, `use.ignoreHTTPSErrors`
- `projects` for Chrome, Firefox, Safari, Mobile Chrome

### 2. Page Object Pattern
```typescript
// pages/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}

  async goto() { await this.page.goto('/login'); }
  async login(email: string, password: string) {
    await this.page.fill('[data-testid="email"]', email);
    await this.page.fill('[data-testid="password"]', password);
    await this.page.click('[data-testid="submit"]');
  }
}

// tests/login.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

test('successful login', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('user@example.com', 'password123');
  await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
});
```

### 3. Test Organization
- Group by feature: `tests/login/`, `tests/checkout/`
- Use `test.describe` for logical grouping within files
- Use `test.beforeEach` for common setup (auth state, navigation)
- Use `test.use({ storageState: 'auth.json' })` for authenticated tests

### 4. Data Management
- Use `test.use({ baseURL })` for environment switching
- Create test data via API calls in `beforeAll` (not via UI)
- Clean up test data in `afterAll`
- Use `test.skip(!process.env.CI, 'Only runs in CI')` for conditional tests

### 5. CI/CD Integration
```yaml
# .github/workflows/playwright.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## Guardrails
- E2E tests are **slow** and **flaky** — use them sparingly for critical paths only
- Prefer API/integration tests for backend logic
- Use `test.only` only temporarily (never commit)
- Tag flaky tests with `@flaky` and track in backlog
- Maximum 10% of total test suite should be E2E

## Output
- Playwright test suite with Page Objects
- CI/CD pipeline configuration
- `playwright-report/` test artifacts
- Test evidence (screenshots, videos, traces) for failures
