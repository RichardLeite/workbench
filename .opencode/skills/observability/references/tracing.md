# Distributed Tracing — Reference

## What is distributed tracing
Tracing follows a single request across multiple services, recording timing and metadata at each hop. Essential for debugging latency, errors, and dependencies in microservice architectures.

## OpenTelemetry setup

### Node.js auto-instrumentation
```javascript
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { MySQL2Instrumentation } = require('@opentelemetry/instrumentation-mysql2');

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'payment-service',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: 'production'
  })
});

provider.addSpanProcessor(new SimpleSpanProcessor(
  new OTLPTraceExporter({ url: 'http://collector:4318/v1/traces' })
));

provider.register();

// Register instrumentations
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
registerInstrumentations({
  instrumentations: [
    new ExpressInstrumentation(),
    new HttpInstrumentation(),
    new MySQL2Instrumentation()
  ]
});
```

## Manual spans
```javascript
const tracer = opentelemetry.trace.getTracer('payment-service');

async function processPayment(orderId) {
  const span = tracer.startSpan('process-payment', {
    attributes: { 'order.id': orderId }
  });

  return await tracer.withActiveSpan(span, async () => {
    try {
      const result = await paymentGateway.charge(orderId);
      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttribute('payment.status', result.status);
      return result;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  });
}
```

## Context propagation

### HTTP headers (W3C Trace Context)
| Header | Format | Example |
|--------|--------|---------|
| `traceparent` | `00-traceid-spanid-01` | `00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01` |
| `tracestate` | `vendor=value1,another=value2` | `congo=t61rcWkgMzE` |

### Propagation pattern
```javascript
// Service A (sending)
const headers = {};
opentelemetry.propagation.inject(activeContext, headers);
await fetch('http://service-b/api', { headers });

// Service B (receiving) — automatic via HttpInstrumentation
```

## Sampling strategies

| Strategy | Description | When to use |
|----------|-------------|-------------|
| **Head-based** | Decision at request entry (e.g., 5% of all requests) | Low volume, simple setup |
| **Tail-based** | Sample based on request characteristics (e.g., all errors, slow requests) | High volume, need full error traces |
| **Rate-limited** | Max N traces per second, then sample | Constrained storage budget |
| **Health** | Sample only specific endpoints (e.g., critical business flows) | Targeted debugging |

## Span attributes (conventions)

```yaml
# HTTP
http.method: POST
http.url: /api/v2/payments
http.status_code: 200
http.request_content_length: 512

# Database
db.system: mysql
db.name: orders_db
db.statement: SELECT * FROM orders WHERE id = ?
db.connection_string: "mysql://***@host:3306"

# Messaging
messaging.system: rabbitmq
messaging.destination: order.created
messaging.message_id: msg_abc

# Custom
payment.amount: 49.90
payment.method: credit_card
payment.gateway: stripe
```

## Trace analysis checklist
- [ ] All services emit traces with consistent service names
- [ ] No gaps in trace (missing spans = missing instrumentation)
- [ ] Error spans include exception stack trace
- [ ] Database spans include query text (parameterized)
- [ ] External API calls time out and are traced
- [ ] Async jobs (queues, cron) are traced with parent span context
- [ ] Sampling rate is appropriate for traffic volume
