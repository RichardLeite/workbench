---
name: security-lgpd
description: Protect PII, secrets, and authorization boundaries.
---

## Goal
Protect PII, secrets, and authorization boundaries.

## Procedure
1. Inventory PII fields touched by change.
2. Verify authn/authz constraints.
3. Ensure sensitive data is masked in logs.
4. Validate retention and deletion behavior.
5. Confirm no secrets in source control.
6. Capture evidence in PR and ADR (when applicable).

## LGPD Compliance Checklist

### Data Inventory
- [ ] Which PII fields are touched by this change?
- [ ] What is the legal basis for processing? (consent, contract, legal obligation)
- [ ] Is data retention defined? (auto-delete after X days/months)
- [ ] Is there a data export mechanism? (right to portability)

### Security Controls
- [ ] PII encrypted at rest? (database encryption / field-level)
- [ ] PII encrypted in transit? (HTTPS mandatory)
- [ ] Access control: only authorized roles can access
- [ ] Audit log: who accessed what and when?

### Incident Prevention
- [ ] No PII in application logs (mask or omit)
- [ ] No PII in error messages exposed to user
- [ ] No PII in URLs (query strings, path params)
- [ ] Session timeout enforced for sensitive operations

### Data Subject Rights
- [ ] Can user request deletion? (right to be forgotten)
- [ ] Can user request data export? (portability)
- [ ] Can user correct inaccurate data? (rectification)

## Mandatory checks
- [ ] no plaintext secrets in code
- [ ] no certificates/keys committed
- [ ] logs free of sensitive payloads
- [ ] PII fields identified and documented
- [ ] Retention policy defined (or N/A documented)
