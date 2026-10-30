---
name: mysql-performance
description: MySQL query optimization, index strategy, schema design, EXPLAIN analysis, N+1 detection. Use when optimizing slow queries or designing database schemas.
category: database
---

# MySQL Performance

## Goal
Optimize MySQL queries, design efficient indexes, and prevent N+1 problems using systematic EXPLAIN analysis and schema best practices.

## When to use
- "optimize slow query" or "query is slow"
- Designing new database schema or migration
- "add missing indexes" or "fix N+1"
- Reviewing database performance in code review

## Procedure

### 1. Identify the Slow Query
```sql
-- Check slow query log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 0.5;  -- queries >500ms

-- View recent slow queries
SELECT * FROM mysql.slow_log ORDER BY start_time DESC LIMIT 10;

-- Current running queries
SHOW FULL PROCESSLIST;
```

### 2. EXPLAIN Analysis
```sql
EXPLAIN FORMAT=JSON
SELECT o.*, c.name
FROM orders o
JOIN customers c ON c.id = o.customerId
WHERE o.companyId = 123 AND o.status = 'pending'
ORDER BY o.createdAt DESC
LIMIT 20;
```

### 3. Interpret EXPLAIN output
| Column | Good | Bad |
|--------|------|-----|
| `type` | `const`, `eq_ref`, `ref` | `ALL` (full scan) |
| `key` | Index being used | `NULL` (no index) |
| `rows` | Close to actual row count | 10x or more than actual |
| `Extra` | `Using index` (covering) | `Using filesort`, `Using temporary` |
| `filtered` | > 90% | < 10% (bad selectivity) |

### 4. Apply Optimizations (smallest first)

**Index fixes:**
```sql
-- Add missing index for filtering + sorting
ALTER TABLE orders ADD INDEX idx_company_status_date (companyId, status, createdAt);

-- Covering index (all columns in query)
ALTER TABLE orders ADD INDEX idx_covering (companyId, status, createdAt, total, customerId);
```

**Query rewrites:**
- Replace `SELECT *` with needed columns
- Break large queries into batches
- Use `EXISTS` instead of `IN` for subqueries
- Add `LIMIT` where applicable

**Schema changes:**
- Normalize repeated data
- Add generated columns for computed filters
- Archive old data to partition or separate table

### 5. N+1 Detection
```javascript
// ❌ N+1 — 1 query for orders + N for each customer
const orders = await Order.findAll({ where: { companyId } });
for (const order of orders) {
  const customer = await Customer.findByPk(order.customerId);
}

// ✅ Eager loading
const orders = await Order.findAll({
  where: { companyId },
  include: [{ model: Customer, as: 'customer' }]
});
```

## Output
- EXPLAIN plans with interpretation
- Index recommendations (with DDL)
- Query rewrite suggestions
- Before/after performance measurements

## References
- [Query Optimization](references/query-optimization.md) — EXPLAIN deep dive, query rewrites, batch processing
- [Index Strategy](references/index-strategy.md) — Index types, composite index order, cardinality, covering indexes
