# Mutation Testing (Stryker)

> Use when you need to measure **test quality** — not just coverage percentage,
> but whether your tests actually catch real bugs.

## Installation

```bash
cd meu-projeto-api
yarn add --dev @stryker-mutator/core @stryker-mutator/jest-runner
```

## Why Mutation Testing

Traditional line coverage tells you what code **ran**, not what was **verified**.

| Metric | What it measures | Limitation |
|--------|-----------------|------------|
| `lcov` line coverage | Lines executed during test | A test can run a line without asserting anything |
| **Mutation score** | Tests that detect mutants (injected bugs) | If a mutant survives, your test didn't verify that behavior |

## Configuration

Create `stryker.conf.json` in the project root:

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "yarn",
  "reporters": ["html", "clear-text", "progress"],
  "testRunner": "jest",
  "coverageAnalysis": "perTest",
  "thresholds": {
    "high": 80,
    "low": 60,
    "break": 50
  },
  "mutate": [
    "src/services/**/*.js",
    "src/controllers/**/*.js",
    "src/utils/**/*.js"
  ],
  "ignorePatterns": [
    "src/__deploy_tests__/**"
  ]
}
```

## Running

```bash
# Full mutation test
yarn stryker run

# Specific files only (faster for development)
yarn stryker run --mutate src/services/CustomerService.js

# With timeout per mutant (for slow tests)
yarn stryker run --timeout-ms 30000
```

## Understanding the Report

```
#26. [Survived] ConditionalExpression
@@ -1,4 +1,4 @@
-  return price > 0 ? price * 0.9 : 0;
+  return price > 0 ? price * 1.1 : 0;
  Tests: 0/1 tested
```

**Interpretation:**
- ❌ **Survived** = mutant não foi morto → teste não verifica esse comportamento
- ✅ **Killed** = teste detectou a mutação
- ☠️ **Timed out** = loop infinito (mutante causou timeout)
- ⚠️ **No coverage** = código não é executado por nenhum teste

## Priority Targets (High ROI)

| Mutation Score | Action |
|---|---|
| `0-40%` | Tests exist but don't verify behavior — add assertions |
| `40-70%` | Core logic is tested, edge cases missing — add property tests |
| `70-90%` | Good coverage — focus on survived mutants in critical paths |
| `90-100%` | Excellent — maintain threshold in CI |

## Interpreting Mutants by Operator

| Mutator | What it does | If it survives, you're missing |
|---------|-------------|-------------------------------|
| `ConditionalExpression` | Flips `>` to `<`, `&&` to `\|\|` | Boundary condition test |
| `ArithmeticOperator` | `+` → `-`, `*` → `/` | Calculation correctness test |
| `StringLiteral` | `"active"` → `""` | Status/state value test |
| `BlockStatement` | Removes entire block | Side-effect / error handling test |
| `ObjectLiteral` | Removes properties | Shape/completeness test |
| `BooleanLiteral` | `true` → `false` | Conditional branch test |

## CI Integration (GitHub Actions)

```yaml
- name: Mutation Testing
  run: |
    yarn stryker run --mutate src/services/*.js
    # Fail if mutation score below threshold (already set in config)
```

## Best Practices

1. **Don't run on the whole codebase at first** — target one service/file at a time
2. **Fix survived mutants in order of business criticality** — financial > operational > cosmetic
3. **Add property-based tests for survived mutants** — fast-check + Stryker are complementary
4. **Set CI break threshold at 50%** — prevent regression without blocking development
5. **Review survived mutants before dismissing** — some are equivalent (same behavior), but most are real gaps
6. **Run Stryker before refactoring legacy code** — know exactly where your safety net has holes
