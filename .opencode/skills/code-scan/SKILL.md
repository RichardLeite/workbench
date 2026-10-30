# Code Scan (SAST + Security)

> Use when you need to run **static analysis** and **security scanning** on the codebase
> before submitting a PR or during CI.

## Tools

| Tool | Purpose | Installation |
|------|---------|-------------|
| **Semgrep** | SAST (Static Application Security Testing) — find bugs, anti-patterns, policy violations | `npm install -g semgrep` |
| **Trivy** | Container/FS vulnerability scanner — find known CVEs in dependencies | `winget install aquasecurity.Trivy` or `npm install -g trivy` |

## Quick Start

```bash
# Semgrep — scan source code
semgrep --config=auto src/

# Trivy — scan dependencies for CVEs
trivy fs --scanners vuln .

# Combined
semgrep --config=auto --error src/ && trivy fs --scanners vuln --exit-code 1 .
```

## Semgrep Rules

### Built-in configs (no setup needed)

```bash
# Auto-detect language and apply community rules
semgrep --config=auto src/

# OWASP top 10
semgrep --config=p/owasp-top-ten src/

# JavaScript/Node.js specific
semgrep --config=p/javascript src/
semgrep --config=p/nodejs src/

# Sequelize/ORM injection
semgrep --config=p/sql-injection src/
```

### Custom Rules for the Project

Create `.opencode/rules/semgrep/`:

```yaml
# sql-injection.yaml
rules:
  - id: sequelize-raw-query
    patterns:
      - pattern: sequelize.query($QUERY)
    message: "Raw SQL query detected — use model methods instead"
    languages: [javascript]
    severity: WARNING

  - id: console-log
    patterns:
      - pattern: console.log(...)
    message: "Remove console.log before committing"
    languages: [javascript]
    severity: WARNING

  - id: hardcoded-secret
    patterns:
      - pattern-regex: (password|secret|token|api_key)\s*[=:]\s*["'][^"']+["']
    message: "Possible hardcoded secret detected"
    languages: [javascript]
    severity: ERROR
```

## Trivy Scanning

```bash
# Scan project dependencies
trivy fs --scanners vuln,secret .

# Ignore false positives (add to .trivyignore)
echo "CVE-2023-1234" >> .trivyignore

# HTML report
trivy fs --format html --output report.html .
```

## CI Integration (GitHub Actions)

```yaml
- name: Semgrep SAST
  uses: semgrep/semgrep-action@v1
  with:
    config: auto

- name: Trivy Vulnerability Scan
  uses: aquasecurity/trivy-action@master
  with:
    scan-type: fs
    scan-ref: .
    exit-code: 1
```

## 4-Layer Review Pipeline

For comprehensive pre-PR review, run all layers:

```bash
# Layer 1: Lint
yarn format:check && yarn lint

# Layer 2: SAST (Semgrep)
semgrep --config=auto --error src/

# Layer 3: Security (Trivy)
trivy fs --scanners vuln,secret --exit-code 1 .

# Layer 4: AI Code Review
# Done by @revisor agent during PR
```

## Best Practices

1. **Run Semgrep pre-commit** — add to husky/lint-staged
2. **Don't block on false positives** — use `# nosemgrep` comments to suppress verified safe lines
3. **Scan dependencies weekly** — Trivy detects new CVEs daily
4. **Custom rules over generic** — project-specific rules catch more relevant issues
5. **Fail CI on HIGH/CRITICAL** — allow WARNING to pass but report them
