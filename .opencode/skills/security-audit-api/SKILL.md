---
name: security-audit-api
description: Audits REST APIs for OWASP Top 10 vulnerabilities, auth bypass, rate limiting, input validation, and data exposure. Use when reviewing API security or asked to "audit my API", "check auth", "review security".
category: security
---

# Security Audit — API

## Goal
Systematically audit REST APIs for OWASP Top 10 vulnerabilities, broken authentication, rate limiting gaps, input validation flaws, and sensitive data exposure.

## When to use
- "audit my API" or "check API security"
- "review security" of an endpoint or service
- User reports suspicious behavior or unauthorized access
- Before deploying a new public endpoint

## Procedure

### 1. Reconnaissance
- List all endpoints, methods, and expected auth levels
- Identify exposed PII, tokens, or internal IDs in URLs/responses
- Document authentication mechanism (JWT, session, API key, OAuth)

### 2. Authentication & Authorization
- Test for auth bypass: missing tokens, token tampering, role escalation
- Check token validation (expiry, signature, audience)
- Verify RBAC — can a low-privilege user access admin endpoints?
- Test path traversal: `/api/admin/../user/profile`

### 3. Input Validation
- SQL injection: `' OR 1=1--` in query params and body
- NoSQL injection: `$gt`, `$ne`, `{ "$where": "..." }` in JSON bodies
- XSS: `<script>alert(1)</script>` in user-controlled fields
- Command injection: `; rm -rf /` in file names or shell parameters
- SSRF: internal URLs (`http://169.254.169.254/latest/meta-data/`)

### 4. Rate Limiting & Abuse
- Hit the endpoint 100 times in 10s — is there a 429 response?
- Test password reset, OTP, and login endpoints specifically
- Check for missing or permissive CORS (`Access-Control-Allow-Origin: *`)

### 5. Data Exposure
- Are passwords, tokens, or PII in response bodies?
- Are stack traces or debug info exposed in error responses?
- Is pagination leaking internal IDs that enable enumeration?
- Is HTTPS enforced? Check HSTS headers.

### 6. Headers & Configuration
- Check `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`
- Verify `Strict-Transport-Security` (HSTS) with sufficient `max-age`
- Check `Cache-Control: no-store` for sensitive responses

## Output
A security audit report with:
- Vulnerabilities found (with severity: P0/P1/P2)
- Reproduction steps (curl commands or request examples)
- Remediation recommendations
- Evidence (screenshots, response dumps)

## References
- [Authentication](references/authentication.md) — JWT, OAuth, API key checks
- [Rate Limiting](references/rate-limiting.md) — Throttling strategies and bypass tests
- [Data Exposure](references/data-exposure.md) — PII, secrets, enumeration
