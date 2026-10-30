---
name: security-audit-database
description: Audits database security — RLS policies, SQL injection vectors, access control, data encryption, audit logging. Use when reviewing database access or asked to "check RLS", "audit database", "review data access".
category: security
---

# Security Audit — Database

## Goal
Systematically audit database security: row-level security, SQL injection vectors, access controls, encryption, and audit logging.

## When to use
- "check RLS" or "audit database security"
- "review data access" or "check SQL injection"
- New database schema or migration that handles sensitive data
- User reports data leakage across tenants

## Procedure

### 1. Access Control Review
- List all database users, roles, and their grants
- Verify least-privilege principle (application user has only CRUD on needed tables)
- Check for shared credentials or hardcoded connection strings
- Review connection pooling configuration

### 2. Row-Level Security (RLS)
- Verify RLS policies exist on multi-tenant tables
- Test cross-tenant access by modifying tenant_id/user_id in queries
- Check that RLS cannot be bypassed via direct table access or views
- Review RLS policy functions for performance and correctness

### 3. SQL Injection
- Audit raw query construction (string concatenation) in codebase
- Verify parameterized queries / prepared statements are used everywhere
- Check ORM usage — does it prevent injection by default?
- Test edge cases: `$1`, `?` placeholders in dynamic query builders

### 4. Encryption
- Is data encrypted at rest? (TDE, EBS, or application-level encryption)
- Are PII columns encrypted at the application level (AES-256-GCM)?
- Is TLS enforced for all database connections?
- Verify backup encryption

### 5. Audit Logging
- Are schema changes logged? (DDL triggers)
- Is data access logged for sensitive tables?
- Check `general_log` or equivalent is not enabled in production
- Query audit log retention and rotation policy

### 6. Network Security
- Is the database exposed to the internet? (should not be)
- Is there a firewall/security group restricting source IPs?
- Are database ports accessible from non-application networks?

## Checklist
- [ ] Application uses least-privilege database user
- [ ] RLS policies cover all multi-tenant tables
- [ ] No raw SQL concatenation in codebase
- [ ] Parameterized queries used in all prepared statements
- [ ] PII columns encrypted at application level
- [ ] TLS enforced for database connections
- [ ] Audit logs enabled for schema and sensitive data changes
- [ ] Database not publicly accessible
- [ ] Connection strings never hardcoded (secrets manager / env vars)
- [ ] Regular credential rotation (max 90 days)

## References
- [RLS Policies](references/rls-policies.md) — Multi-tenant isolation patterns
- [SQL Injection](references/sql-injection.md) — Prevention and detection
