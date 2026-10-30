---
name: observability
description: Structured logging, metrics collection, distributed tracing, SLO monitoring, alerting rules. Use when setting up monitoring, logging, or observability infrastructure.
category: devops
---

# Observability

## Goal
Implement structured observability — logging, metrics, distributed tracing, and SLO-based alerting — for production services.

## When to use
- Setting up monitoring or observability infrastructure
- "add structured logging" or "set up tracing"
- Debugging production issues or performance bottlenecks
- Defining SLOs and alerting rules

## Procedure

### 1. Structured Logging
- Use structured JSON logs (never plain text)
- Include correlation ID (`X-Request-Id`) in every log line
- Follow log levels: `error` (immediate action), `warn` (unexpected but ok), `info` (important event), `debug` (troubleshooting)
- Never log PII, secrets, or tokens
- Use consistent field names across services

### 2. Metrics Collection
- Identify RED metrics: Rate (requests/sec), Errors (error count), Duration (latency p50/p95/p99)
- Identify USE metrics: Utilization, Saturation, Errors (for each resource)
- Expose metrics endpoint (Prometheus `/metrics` or equivalent)
- Define custom business metrics (order count, signups, payment failures)

### 3. Distributed Tracing
- Instrument all services with OpenTelemetry (or equivalent)
- Propagate trace context via HTTP headers (`traceparent`)
- Trace spans for: HTTP requests, database queries, external API calls, async jobs
- Configure sampling strategy (head-based or tail-based)

### 4. SLO Definition
```
SLO: 99.9% of GET /api/v2/products requests complete in < 500ms over 30d
SLI: (successful fast requests) / (total requests) * 100
Budget: 0.1% error = ~43min downtime per month
Burn rate: 1h at 2x error budget consumption → alert
```

### 5. Alerting Rules
- Alert on **symptoms** (high latency, error rate), not causes (CPU high)
- Define severity: Page (P0), Ticket (P1), Log (P2)
- Use multi-window, multi-burn-rate alerts (avoid flapping)
- Include runbook link in every alert

### 6. Dashboard Creation
- **Service overview**: RED metrics, SLO burn rate
- **Dependencies**: database, external API, queue latency
- **Business**: revenue, active users, conversion rate
- **Deployment**: version, instance count, rollback indicator

## Output
- Structured logging configuration
- Prometheus/Grafana dashboard definitions
- OpenTelemetry instrumentation code
- Alerting rules (Prometheus, PagerDuty, OpsGenie format)

## References
- [Logging](references/logging.md) — Structured log formats, best practices, correlation IDs
- [Metrics](references/metrics.md) — RED, USE, Prometheus, custom business metrics
- [Tracing](references/tracing.md) — OpenTelemetry, span attributes, sampling, context propagation
