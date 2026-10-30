# Metrics — Reference

## The RED Method (Request-oriented)
```
Rate     → requests per second      (counter)
Errors   → failed requests per sec  (counter)
Duration → latency distribution     (histogram)
```

### Prometheus rules (RED)
```yaml
# HTTP request rate by endpoint
http_requests_total{status=~"2..|3.."}  # success rate
http_requests_total{status=~"4..|5.."}  # error rate
rate(http_requests_total[5m])           # request rate

# Latency histogram
http_request_duration_seconds_bucket{le="0.1"}   # 100ms
http_request_duration_seconds_bucket{le="0.5"}   # 500ms
http_request_duration_seconds_bucket{le="1.0"}   # 1s
```

## The USE Method (Resource-oriented)
```
Utilization  → % time resource is busy    (gauge)
Saturation   → queue depth / waiting      (gauge)
Errors       → error count on resource    (counter)
```

### Per component
| Resource | Utilization | Saturation | Errors |
|----------|-------------|------------|--------|
| CPU | `node_cpu_seconds_total` | `loadavg` or run queue | — |
| Memory | `node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes` | OOM kills | — |
| Disk | `node_disk_io_time_seconds_total` | `node_disk_io_time_weighted_seconds_total` | `node_disk_errors_total` |
| Network | `node_network_receive_bytes_total / bandwidth` | dropped packets | `node_network_transmit_errors_total` |
| DB connections | `pg_stat_activity_count / max_connections` | `pg_stat_activity_waiting` | connection errors |

## Business metrics (custom)

```javascript
// Node.js with prom-client
const client = require('prom-client');

const ordersCreated = new client.Counter({
  name: 'orders_created_total',
  help: 'Total number of orders created',
  labelNames: ['status', 'payment_method']
});

const orderValue = new client.Histogram({
  name: 'order_value_amount',
  help: 'Order value distribution',
  buckets: [10, 50, 100, 500, 1000, 5000]
});

const activeUsers = new client.Gauge({
  name: 'active_users',
  help: 'Currently active users (last 5 min)'
});
```

## Metric cardinality warning
- **High cardinality** (unique values > 1000) kills Prometheus performance
- Avoid labels with: user IDs, email addresses, request paths with params, timestamps
- Instead: aggregate before exposing or use logging/tracing for high-cardinality data

## Alert thresholds (common)

| Metric | Warning | Critical |
|--------|---------|----------|
| Error rate (5m) | > 1% | > 5% |
| p99 latency | > 1s | > 5s |
| CPU utilization | > 70% (15m) | > 90% (5m) |
| Memory usage | > 80% | > 95% |
| Disk usage | > 80% | > 90% |
| DB connections | > 70% of max | > 85% of max |
