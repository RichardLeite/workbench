# Query Optimization — Reference

## EXPLAIN output deep dive

### type column (access method)
| Value | Meaning | When to worry |
|-------|---------|:-------------:|
| `system` | Table has 0 or 1 row | Never (ideal) |
| `const` | Primary key / unique lookup | Ideal |
| `eq_ref` | JOIN using PK (one row per outer row) | Good |
| `ref` | Non-unique index lookup (multiple rows) | Good |
| `range` | Index range scan (`BETWEEN`, `>`, `<`, `IN`) | Acceptable |
| `index` | Full index scan | Needs review |
| `ALL` | Full table scan | ⛔ Bad — add index |

### Extra column warning flags
| Value | Meaning | Fix |
|-------|---------|-----|
| `Using filesort` | Sort without index | Add index with sort columns, match ORDER BY |
| `Using temporary` | Temporary table for GROUP BY / DISTINCT | Add covering index or rewrite query |
| `Using index` | Covering index (good) | No action needed |
| `Using where` | Filter after storage engine | Try to push filter into index |
| `Impossible WHERE` | WHERE always false | Remove dead condition |

## Common query patterns and fixes

### Pattern 1: Filter + Sort on different columns
```sql
-- Slow: WHERE on companyId, ORDER BY createdAt needs filesort
SELECT * FROM orders WHERE companyId = 123 ORDER BY createdAt DESC;

-- Fix: Composite index (companyId, createdAt)
ALTER TABLE orders ADD INDEX idx_company_created (companyId, createdAt);
```

### Pattern 2: Pagination with OFFSET
```sql
-- Slow: MySQL reads all rows up to OFFSET + LIMIT
SELECT * FROM orders ORDER BY id LIMIT 100000, 20;

-- Fix: Keyset pagination (cursor)
SELECT * FROM orders WHERE id > 100000 ORDER BY id LIMIT 20;
```

### Pattern 3: COUNT(*) on large table
```sql
-- Slow: Full scan for approximate count
SELECT COUNT(*) FROM orders WHERE status = 'pending';

-- Fix 1: Maintain counter in summary table
-- Fix 2: Use covering index (status column)
ALTER TABLE orders ADD INDEX idx_status (status);
```

### Pattern 4: SELECT * with JOIN
```sql
-- Slow: Returns all columns including large TEXT fields
SELECT * FROM orders o JOIN customers c ON c.id = o.customerId;

-- Fix: Select only needed columns
SELECT o.id, o.total, o.status, c.name FROM orders o JOIN customers c ...;
```

## Batch processing pattern
```javascript
// Instead of processing 100k rows at once:
const BATCH_SIZE = 1000;
let lastId = 0;

while (true) {
  const rows = await db.query(
    'SELECT * FROM orders WHERE id > ? ORDER BY id LIMIT ?',
    [lastId, BATCH_SIZE]
  );
  if (rows.length === 0) break;

  for (const row of rows) {
    await processOrder(row);
  }

  lastId = rows[rows.length - 1].id;
}
```

## Monitoring
```sql
-- Check index usage
SELECT * FROM sys.schema_unused_indexes;

-- Queries with full table scans
SELECT * FROM sys.statements_with_full_table_scans;

-- Most IO-intensive statements
SELECT * FROM sys.statements_with_sorting LIMIT 10;
```
