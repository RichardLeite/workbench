---
name: performance
description: Fix bottlenecks using measurable evidence.
---

## Goal
Fix bottlenecks using measurable evidence.

## Procedure
1. Define baseline metric (latency, CPU, query time).
2. Reproduce bottleneck with trace/profile/query plan.
3. Apply smallest effective optimization.
4. Re-measure with same method.
5. Register before/after evidence and risk.

## Typical actions
- SQL index/query correction (EXPLAIN, slow query log)
- pagination and limit policy
- caching for hot reads (Redis, in-memory)
- remove N+1 or repeated remote calls
- lazy loading for expensive components
- bundle size optimization (code splitting, tree shaking)
- connection pooling tuning
- batch processing for bulk operations

## Performance checklist

### Query performance
- [ ] Indexes exist for filtered/sorted columns
- [ ] No full table scans on large tables (>10k rows)
- [ ] Pagination implemented (cursor or offset-based)
- [ ] N+1 queries eliminated (eager loading where needed)
- [ ] EXPLAIN plan checked for new queries

### API performance
- [ ] Response payload limited to needed fields (projection)
- [ ] Compression enabled (gzip/brotli)
- [ ] Rate limiting on expensive endpoints
- [ ] Async processing for long-running operations

### Frontend performance
- [ ] Components lazy-loaded (React.lazy, Suspense)
- [ ] Images optimized (WebP, srcset)
- [ ] Bundle size monitored (webpack-bundle-analyzer)
- [ ] Memoization applied where beneficial (useMemo, useCallback)

## Before/After evidence format

```markdown
### Performance evidence

**Before:**
- Query time: 2.3s
- Response size: 450KB
- Memory: 120MB

**After:**
- Query time: 45ms
- Response size: 28KB
- Memory: 60MB

**Improvement: 98% faster query, 94% smaller response**
```
