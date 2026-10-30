---
name: redis-caching
description: Redis caching strategies — cache-aside, write-through, TTL management, data structures, eviction policies. Use when implementing caching or optimizing Redis usage.
category: database
---

# Redis Caching

## Goal
Design and implement efficient Redis caching — choose the right strategy, data structure, eviction policy, and TTL management for your use case.

## When to use
- Implementing caching for the first time
- "optimize Redis usage" or "reduce cache misses"
- Debugging caching issues (stale data, memory spikes, high latency)
- Choosing a caching strategy for a new feature

## Procedure

### 1. Choose Caching Strategy

```
Read-heavy data with moderate write frequency?
├── Yes → Cache-aside (read-through)
│   Application checks cache first, falls back to DB
├── No → Write-heavy data?
│   ├── Yes → Write-through
│   │   Write to DB + cache atomically
│   └── No → Session or rate-limit data?
│       ├── Yes → Write-behind / TTL-only
│       └── No → Consider if caching helps at all
```

### 2. Data Structure Selection

| Use case | Structure | Example |
|----------|-----------|---------|
| Key-value lookup | String | `user:{id} → JSON` |
| Leaderboard / ranking | Sorted Set | `leaderboard:score → ZADD` |
| Rate limiter | String + TTL | `ratelimit:{ip} → INCR, EXPIRE` |
| Session store | Hash | `session:{id} → HSET` |
| Queue / job buffer | List | `queue:emails → LPUSH, BRPOP` |
| Cache tags | Set | `tag:products:{id} → SADD` |
| Geo queries | Geo | `GEORADIUS` |
| Bitmap analytics | Bitmap | `BITCOUNT daily:logins:2026-06-20` |

### 3. TTL Management
```
Hot data (accessed every minute)   → TTL: 1-5 minutes
Warm data (accessed every hour)    → TTL: 1-6 hours
Cold data (accessed daily)         → TTL: 24 hours
Reference data (rarely changes)    → TTL: 7-30 days (+ invalidation)

Rule: Set TTL on every key. No key should live forever.
```

### 4. Eviction Policy Selection

| Policy | Description | When to use |
|--------|-------------|-------------|
| `noeviction` | Returns error on OOM | Never in production |
| `allkeys-lru` | Evicts least recently used keys | General caching (default) |
| `allkeys-lfu` | Evicts least frequently used keys | Variable access frequency |
| `volatile-lru` | Evicts only keys with TTL | When mixing cache + persistent data |
| `volatile-ttl` | Evicts shortest TTL first | When TTL accuracy matters |

### 5. Cache Invalidation
- **TTL expiry**: simplest, eventual consistency
- **Write-through**: update cache on every write
- **Cache invalidation**: delete cache key when data changes
- **Pattern**: `write → invalidate cache → next read fills cache`

### 6. Monitoring
- Track: cache hit ratio, memory usage, eviction count, latency
- Alert on: hit ratio < 80%, evictions > 0, latency > 10ms
- Use: `INFO`, `MEMORY STATS`, `SLOWLOG GET`, redisinsight

## Output
- Caching strategy recommendation with justification
- Redis configuration (maxmemory, eviction, persistence)
- Code examples for cache operations
- Monitoring dashboard suggestions

## References
- [Caching Patterns](references/caching-patterns.md) — Cache-aside, write-through, write-behind, stampede prevention
- [Data Structures](references/data-structures.md) — Strings, Hashes, Lists, Sets, Sorted Sets, Bitmaps, HyperLogLog
