# Findings — [Task Name]

> Generated: YYYY-MM-DD
> Author: [Agent/Tool]

## Overview
Brief summary of what was discovered during this task.

## Codebase Observations

### File: `src/services/example.js`
- **Line 42**: Uses raw SQL concatenation instead of parameterized query
- **Pattern**: Service layer directly accesses models without repository abstraction
- **Dependency**: Depends on `moment` (deprecated, consider `date-fns` or `dayjs`)

### File: `src/controllers/example.js`
- **Architecture**: Controller handles both HTTP concerns AND business logic
- **Suggest**: Extract `processRefund()` to a separate service
- **Note**: Missing input validation on `req.body.amount`

## Data / Schema Observations

### Table: `orders`
- **Column `status`**: VARCHAR(20) with no CHECK constraint — should be ENUM
- **Index**: Missing composite index on `(companyId, status, createdAt)` — query filtering by company+status range scans
- **Cardinality**: `status` has low cardinality (6 values), good for index

### Query found in slow query log
```sql
SELECT * FROM orders WHERE companyId = 123 AND status = 'pending' ORDER BY createdAt DESC;
```
- **Issue**: Full table scan (420K rows)
- **Suggestion**: Add index `(companyId, status, createdAt)`

## External Dependencies
- **API Gateway**: Rate limit of 100 req/min for `/v2/payments` — need retry logic
- **Redis**: Current TTL for session cache is 24h — should be 1h per security policy
- **Stripe**: Webhook signature verification missing — P0 security finding

## Questions for User
1. Should we refactor the controller/service boundary, or just fix the bug?
2. The Redis TTL change affects active sessions — coordinated deployment needed?

## Misc
- `.env.example` is outdated (missing `REDIS_TTL`, `STRIPE_WEBHOOK_SECRET`)
- Test coverage in this module: 23% — below the 70% minimum for new features
