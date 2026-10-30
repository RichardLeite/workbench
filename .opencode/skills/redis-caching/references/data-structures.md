# Redis Data Structures — Reference

## Strings

### Commands
```
SET key value [NX|XX] [EX seconds] [PX milliseconds]
GET key
GETSET key value           — set and return old value
SETEX key seconds value    — set with TTL
SETNX key value            — set only if not exists (NX)
INCR key / DECR key        — atomic increment/decrement
INCRBY key amount           — atomic increment by amount
STRLEN key
MSET key1 val1 key2 val2   — multi-set
MGET key1 key2              — multi-get
```

### Use cases
- Simple cache entries (JSON blobs)
- Counters, rate limits, sequence generators
- Distributed locks (`SETNX`)
- Session tokens

## Hashes

### Commands
```
HSET user:123 name "John" age "30"
HGET user:123 name
HGETALL user:123            — all fields (expensive for large hashes)
HMSET key field1 val1 field2 val2
HMGET key field1 field2
HINCRBY user:123 visits 1
HDEL user:123 age
HEXISTS user:123 name
HLEN user:123
```

### Use cases
- **Object storage**: user profiles, product details (store as fields)
- **Partial updates**: update single field without retrieving full object
- **Counters per entity**: `HINCRBY user:123 loginCount 1`

### When to use vs. JSON string
| Criteria | Hash | JSON String |
|----------|:----:|:-----------:|
| Read all fields often | ✅ | ✅ |
| Read/update single field | ✅ | ❌ (get whole, parse, set) |
| Many fields (>100) | ⚠️ Slow HGETALL | ✅ |
| Nested objects | ❌ | ✅ |

## Lists

### Commands
```
LPUSH key value            — push to left (head)
RPUSH key value            — push to right (tail)
LPOP key                   — pop from left
RPOP key                   — pop from right
LLEN key
LRANGE key start stop      — range query
LTRIM key start stop       — trim to range
BLPOP key timeout          — blocking left pop
BRPOP key timeout          — blocking right pop
```

### Use cases
- **Queues**: `LPUSH + BRPOP` = reliable FIFO queue
- **Recent items**: `LPUSH + LTRIM` = capped list (latest 100 items)
- **Timelines / activity feeds**: paginate with `LRANGE`
- **Message broker**: lightweight pub/sub via list

## Sets (unordered, unique)

### Commands
```
SADD key member1 member2
SREM key member
SMEMBERS key               — all members (expensive)
SISMEMBER key member       — membership check
SCARD key                  — cardinality (count)
SINTER key1 key2           — intersection
SUNION key1 key2           — union
SDIFF key1 key2            — difference
SRANDMEMBER key [count]    — random sample
SPOP key [count]           — pop random member
```

### Use cases
- **Tags/Labels**: `SADD post:42:tags "javascript" "redis"`
- **Unique visitors**: `SADD visitors:2026-06-20 "ip:1.2.3.4"`
- **Relationships**: followers/following, likes
- **Random sampling**: SRANDMEMBER for giveaways

## Sorted Sets

### Commands
```
ZADD leaderboard score member
ZINCRBY leaderboard increment member
ZRANK leaderboard member          — rank (low to high)
ZREVRANK leaderboard member       — rank (high to low)
ZRANGE leaderboard 0 9            — top 10 (low to high)
ZREVRANGE leaderboard 0 9 WITHSCORES — top 10 (high to low)
ZSCORE leaderboard member
ZCARD leaderboard                 — total members
ZREM leaderboard member
ZRANGEBYSCORE leaderboard min max — range by score
ZREMRANGEBYSCORE leaderboard min max — remove by score range
ZCOUNT leaderboard min max        — count by score range
```

### Use cases
- **Leaderboards**: gaming scores, top sellers
- **Rate limiters**: sorted by timestamp window
- **Priority queues**: score = priority
- **Auto-complete**: weighted terms
- **Time-series**: score = timestamp, member = event

## Bitmaps (bit-level operations)

### Commands
```
SETBIT key offset value     — set bit
GETBIT key offset
BITCOUNT key [start end]    — count set bits
BITOP AND/OR/XOR dest key1 key2
BITPOS key value            — find first 0 or 1
```

### Use cases
- **Daily active users**: `SETBIT logins:2026-06-20 userId 1`
- **Feature flags**: bit per feature
- **Bloom filters**: probabilistic membership

## HyperLogLog (approximate count)

### Commands
```
PFADD key element1 element2
PFCOUNT key                 — approximate unique count
PFMERGE dest source1 source2
```

### Use cases
- **Unique visitors** (tolerating ~0.81% error)
- **Search term cardinality**
- **Memory-efficient** counting (12KB per key, billions of elements)

## Configuration for data structure efficiency

```bash
# Adjust hash encoding threshold (default: 512 entries, 64 bytes per entry)
hash-max-ziplist-entries 1024
hash-max-ziplist-value 128

# Adjust list encoding (default: 512)
list-max-ziplist-size -2

# Adjust set encoding (default: 512)
set-max-intset-entries 1024

# Adjust sorted set encoding (default: 128)
zset-max-ziplist-entries 256
zset-max-ziplist-value 64
```
