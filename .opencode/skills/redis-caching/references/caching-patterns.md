# Caching Patterns — Reference

## Pattern 1: Cache-Aside (Lazy Loading)

```
Application → Check Cache → hit? → Return cached data
                         → miss? → Read from DB → Store in cache → Return
```

```javascript
async function getUser(userId) {
  const cacheKey = `user:${userId}`;

  // 1. Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // 2. Cache miss — read from DB
  const user = await db.users.findByPk(userId);
  if (!user) return null;

  // 3. Store in cache with TTL
  await redis.setex(cacheKey, 300, JSON.stringify(user));

  return user;
}
```

**Pros**: Easy, resilient (cache failure doesn't break app)
**Cons**: Cache miss spike on first read (thundering herd), stale data possible

## Pattern 2: Write-Through

```
Write → Write to DB → Write to cache → Confirm
```

```javascript
async function updateUser(userId, data) {
  // 1. Update DB first
  const user = await db.users.update(userId, data);

  // 2. Update cache
  await redis.setex(`user:${userId}`, 300, JSON.stringify(user));

  return user;
}
```

**Pros**: Cache always fresh, no stale reads
**Cons**: Slower writes, cache failure blocks write

## Pattern 3: Write-Behind (Write-Back)

```
Write → Write to cache (fast) → Async queue → Eventually write to DB
```

**Pros**: Very fast writes, absorbs write spikes
**Cons**: Data loss risk if Redis crashes before DB write

## Pattern 4: Cache Invalidation

```javascript
async function updateUser(userId, data) {
  // 1. Update DB
  const user = await db.users.update(userId, data);

  // 2. Delete cache (next read will re-populate)
  await redis.del(`user:${userId}`);
  await redis.del(`user:${userId}:profile`);

  return user;
}
```

**Pros**: Simple, works with any caching strategy
**Cons**: Brief inconsistency window (between DB update and cache invalidation)

## Cache Stampede (Thundering Herd) Prevention

When multiple requests simultaneously miss cache and all hit DB.

### Solution 1: Mutex (Locking)
```javascript
async function getExpensiveData(key) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  // Try to acquire lock
  const lock = await redis.set(`lock:${key}`, '1', 'NX', 'EX', 5);

  if (lock) {
    // This process fetches data
    const data = await expensiveQuery();
    await redis.setex(key, 3600, JSON.stringify(data));
    return data;
  }

  // Other process — wait and retry
  await sleep(50);
  return getExpensiveData(key);
}
```

### Solution 2: Stale-while-revalidate
```javascript
// Serve stale data + async refresh
const cached = await redis.get(key);
const staleTimeout = 50; // % of TTL

if (cached && cached.ttl > staleTimeout) {
  // Fresh enough, return immediately
  return JSON.parse(cached);
}

// Serve stale but trigger async refresh
const staleData = await redis.get(`stale:${key}`);
refreshInBackground(key); // Fire and forget
return staleData ? JSON.parse(staleData) : null;
```

## Cache key naming convention

```
{entity}:{id}[:{subresource}]     → user:123, order:456:items
{namespace}:{entity}:{id}         → app:user:123
{action}:{params_hash}            → search:md5("query=foo&page=1")
```

## Common pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| No TTL | Memory fills up | Always set TTL |
| Too long TTL | Stale data | Align TTL with data freshness needs |
| Cache miss storm | DB overload | Mutex lock or stale-while-revalidate |
| Hot key | Single key high traffic | Shard key or replicate |
| Error swallowing | Silent stale data | Always have a fallback plan (circuit breaker) |
