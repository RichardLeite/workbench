# Rate Limiting Audit — Reference

## Attack vectors without rate limiting

| Attack | Impact | Typical target |
|--------|--------|----------------|
| Credential stuffing | Account takeover | `/auth/login` |
| Brute force | Password discovery | `/auth/login`, `/auth/verify` |
| OTP bombing | SMS/email costs, user annoyance | `/auth/otp`, `/auth/reset` |
| Web scraping | Data theft | `/api/products`, `/api/users` |
| DDoS | Service degradation | Any public endpoint |
| Enumeration | User/ID discovery | `/api/users/:id`, `/api/email-check` |

## Rate limit strategies

### Token Bucket
- Fixed capacity, refills at constant rate
- Pros: smooth traffic, handles bursts
- Cons: complex to implement correctly
- Best for: general API rate limiting

### Leaky Bucket
- Processes at constant rate, queues excess
- Pros: predictable server load
- Cons: increased latency under load
- Best for: processing pipelines, webhook delivery

### Fixed Window
- Count requests per time window (e.g., 100/min)
- Pros: simple, low memory
- Cons: burst at window boundary can double throughput
- Best for: simple limits, non-critical endpoints

### Sliding Window Log
- Tracks timestamps per user within rolling window
- Pros: most accurate, no burst
- Cons: higher memory/cpu cost
- Best for: sensitive endpoints (login, payment)

### Sliding Window Counter
- Approximate sliding window using counters of sub-windows
- Pros: good accuracy, efficient
- Cons: slightly complex implementation
- Best for: production API gateways

## Testing methodology

```bash
# Brute force test (login endpoint)
for i in $(seq 1 200); do
  curl -s -o /dev/null -w "%{http_code}" \
    -X POST https://api.example.com/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong'$i'"}' \
    -H "X-Forwarded-For: 192.168.1.$i"
  echo ""
done
```

## Checklist
- [ ] Login, OTP, password reset endpoints have strict limits (<10 req/min)
- [ ] Rate limits return `429 Too Many Requests` with `Retry-After` header
- [ ] Blocked requests are logged (user_id, IP, endpoint, count)
- [ ] Limits apply per user (not per IP) for authenticated endpoints
- [ ] IP-based limits for unauthenticated endpoints
- [ ] Admin endpoints have lower limits than user endpoints
- [ ] Response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers
- [ ] Whitelisting mechanism exists for known IPs (webhooks, partners)
