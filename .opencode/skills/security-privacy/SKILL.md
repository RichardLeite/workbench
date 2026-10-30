---
name: security-privacy
description: Protect PII, secrets, authorization boundaries and privacy requirements (LGPD/GDPR as examples).
---

## Goal

Protect personal data, secrets and authorization boundaries throughout the change.

## Procedure

1. Inventory personal data fields touched by the change.
2. Verify authentication and authorization constraints.
3. Ensure sensitive data is masked in logs and errors.
4. Validate retention and deletion behavior.
5. Confirm no secrets in source control.
6. Capture evidence in PR and ADR when applicable.

## Privacy Checklist

### Data Inventory

- [ ] Which personal data fields are touched?
- [ ] What is the legal/contractual basis for processing?
- [ ] Is retention defined (auto-delete after X days/months)?
- [ ] Is there an export mechanism (portability)?

### Security Controls

- [ ] Personal data encrypted at rest?
- [ ] Personal data encrypted in transit (HTTPS)?
- [ ] Access restricted to authorized roles?
- [ ] Audit log records who accessed what and when?

### Incident Prevention

- [ ] No personal data in application logs (mask or omit)
- [ ] No personal data in user-facing error messages
- [ ] No personal data in URLs (query strings, path params)
- [ ] Session timeout enforced for sensitive operations

### Data Subject Rights

- [ ] Can the user request deletion?
- [ ] Can the user request data export?
- [ ] Can the user correct inaccurate data?

## Mandatory Checks

- [ ] No plaintext secrets in code
- [ ] No certificates/keys committed
- [ ] Logs free of sensitive payloads
- [ ] Personal data fields identified and documented
- [ ] Retention policy defined (or N/A documented)

## Regional Notes

Use the applicable regulation as reference (LGPD, GDPR, CCPA, etc.). The
checklist is regulation-agnostic; add regional requirements in the project's
own policy or process.
