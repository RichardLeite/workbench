# Index Strategy — Reference

## Index types

| Type | Description | Use case |
|------|-------------|----------|
| **B-Tree** | Default. Balanced tree for equality + range | Most queries |
| **Hash** | Memory engine only. Equality only | Lookup tables (cache) |
| **Full-text** | Full-text search on CHAR/VARCHAR/TEXT | Search within text |
| **Spatial** | R-Tree for geographic data | GIS queries |
| **Generated column** | Index on computed expression | JSON fields, calculated values |

## Composite index — column order rules

```
WHERE a = 1 AND b = 2 AND c = 3
  → INDEX(a, b, c) ✓  (all three used)
  → INDEX(b, c, a) ✓  (all three used)

WHERE a = 1 AND b > 10 AND c = 3
  → INDEX(a, b, c) ✓  (a = equality, b = range, c = filtered)
  → INDEX(a, c, b) ✗  (c is filtered after range on b, not optimal)

WHERE a = 1 ORDER BY b
  → INDEX(a, b) ✓  (single column, sorted)
  → INDEX(b, a) ✗  (wrong order — filesort needed)
```

### Rule of thumb
1. Place **equality** columns first
2. Place **range** columns (`>`, `<`, `BETWEEN`) second
3. Place **ORDER BY** columns third
4. Place **SELECT** columns last (for covering index)

## Cardinality and selectivity

```sql
-- Check index cardinality
SHOW INDEX FROM orders;

-- Key column shows cardinality (number of unique values)
-- High cardinality = good selectivity
-- Low cardinality (e.g., status with 6 values) = poor alone
```

| Cardinality | Selectivity | Example column | Independently useful? |
|:-----------:|:-----------:|----------------|:---------------------:|
| High (>10k) | High | `id`, `email`, `cpf` | ✅ Yes |
| Medium (100-1k) | Medium | `cityId`, `categoryId` | ⚠️ Maybe with other columns |
| Low (<20) | Low | `status`, `gender`, `type` | ❌ No — always combine |

## Covering indexes

A covering index contains ALL columns needed by a query. MySQL reads only the index, no table access.

```sql
-- Table: orders(id, customerId, companyId, status, total, createdAt, notes TEXT)

-- Query needs: id, customerId, status, total, createdAt
-- Index covers all: no table access needed
ALTER TABLE orders ADD INDEX idx_covers
  (companyId, status, createdAt, total, customerId);
```

Check with: `EXPLAIN shows "Using index" in Extra column`

## Index maintenance

```sql
-- Check index fragmentation
SELECT
  table_name, index_name, stat_value
FROM mysql.innodb_index_stats
WHERE stat_name = 'size';

-- Rebuild indexes (online in MySQL 5.6+)
ALTER TABLE orders ENGINE=InnoDB, ALGORITHM=INPLACE, LOCK=NONE;

-- Analyze table to update cardinality estimates
ANALYZE TABLE orders;

-- Remove unused indexes
SELECT * FROM sys.schema_unused_indexes;
```

## Anti-patterns

| Anti-pattern | Why it hurts | Fix |
|-------------|-------------|-----|
| Indexing every column | Writes slower, more disk | Only index WHERE/JOIN/ORDER BY columns |
| Wide indexes (>5 columns) | Large index size, slower | Keep index narrow; use covering only if needed |
| Low cardinality alone | Pointless (status, isActive) | Combine with other columns |
| Over-indexing small tables (<1k rows) | Maintenance overhead | Index only PK |
| Functions on indexed column | `WHERE YEAR(date) = 2024` | Use range: `date >= '2024-01-01' AND date < '2025-01-01'` |
