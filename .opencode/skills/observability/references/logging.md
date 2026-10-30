# Structured Logging — Reference

## Log format

### JSON structure (standard fields)
```json
{
  "timestamp": "2026-06-20T14:30:00.123Z",
  "level": "info",
  "message": "Payment processed successfully",
  "service": "payment-service",
  "environment": "production",
  "correlation_id": "req-abc123def456",
  "user_id": "usr_789",
  "duration_ms": 145,
  "status_code": 200,
  "method": "POST",
  "path": "/api/v2/payments",
  "version": "2.1.0",
  "instance": "pod-5x8z3"
}
```

### Node.js (pino) example
```javascript
const pino = require('pino');
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
  serializers: {
    req: (req) => ({ method: req.method, url: req.url, correlationId: req.id }),
    res: (res) => ({ statusCode: res.statusCode }),
    err: pino.stdSerializers.err
  }
});

// Usage
logger.info({ userId, amount, status }, 'Payment processed');
logger.error({ err, paymentId }, 'Payment failed');
```

## Log levels

| Level | When to use | Action |
|-------|-------------|--------|
| `fatal` | Service is crashing, unrecoverable | Pager, immediate response |
| `error` | Operation failed, needs human review | Ticket, investigate next business day |
| `warn` | Something unexpected but recovered | Review periodically, track in dashboard |
| `info` | Important lifecycle events | Review on demand, dashboards |
| `debug` | Detailed troubleshooting | Only enabled for specific requests/users |
| `trace` | Very detailed, function-level | Never in production |

## Correlation ID propagation

```javascript
// Middleware (Express)
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// Pass to downstream services
const response = await fetch('https://api.orders/v2/orders', {
  headers: { 'X-Request-Id': currentReqId }
});
```

## Fields to NEVER log
- Passwords, tokens, API keys
- Credit card numbers (mask: `****1234`)
- Full CPF/SSN (mask: `***.456.789-**`)
- Full email (mask: `jo**@example.com`)
- Database connection strings
- Internal IPs or infrastructure details in user-facing logs

## Log retention
| Environment | Retention | Storage |
|-------------|-----------|---------|
| Development | 7 days | Local |
| Staging | 30 days | Centralized (ELK/Loki) |
| Production | 90 days | Centralized (ELK/Loki) |
| Audit trail | 1 year (or legal minimum) | Cold storage |
