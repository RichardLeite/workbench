# Contract Testing — Reference

## What is contract testing
Contract testing validates that an API provider and consumer agree on the shape, types, and constraints of request/response data. It catches breaking changes before deployment.

## Approaches

### 1. OpenAPI/Swagger Response Validation
Validate that API responses match the declared schema.

```javascript
import OpenAPIResponseValidator from 'openapi-response-validator';
import spec from './spec.yaml';

function validateResponse(path, method, statusCode, body) {
  const responses = spec.paths[path][method].responses[statusCode];
  const validator = new OpenAPIResponseValidator({ responses });
  return validator.validateResponse(statusCode, body);
}
```

**Pros**: Declarative, generates docs, widely adopted
**Cons**: Schema can drift from implementation

### 2. Consumer-Driven Contracts (Pact)
Consumer publishes contract expectations; provider verifies against them.

```
┌─────────┐   publishes contract    ┌─────────┐
│Consumer │ ──────────────────────► │ Pact    │
│  (test) │                         │ Broker  │
└─────────┘                         └────┬────┘
                                         │ provider verifies
                                         ▼
                                   ┌─────────┐
                                   │Provider │
                                   │  (API)  │
                                   └─────────┘
```

```javascript
// Consumer side (client test)
const provider = new Pact({ consumer: 'WebApp', provider: 'UsersAPI' });
await provider.addInteraction({
  state: 'user exists',
  uponReceiving: 'a request for user',
  withRequest: { method: 'GET', path: '/api/v2/users/1' },
  willRespondWith: {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { data: { id: 1, name: like('John'), email: like('john@test.com') } }
  }
});
```

### 3. Schema-first validation with TypeScript
```typescript
import { z } from 'zod';

const UserResponse = z.object({
  data: z.object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(200),
    email: z.string().email(),
    createdAt: z.string().datetime()
  })
});

type UserResponse = z.infer<typeof UserResponse>;

// Validate at runtime
const parsed = UserResponse.parse(responseBody);
```

## CI integration
```yaml
# Can be a CI check that prevents deploy if contract breaks
check-contracts:
  runs-on: ubuntu-latest
  steps:
    - run: npm run validate-openapi  # checks paths match
    - run: npm run contract-tests    # Pact verification
```

## Best practices
- Tag contracts with version (`v1`, `v2`) for gradual migration
- Run contract tests **before** deploying provider changes
- Use `can-i-deploy` (Pact) or similar to check provider/consumer compatibility
- Every breaking change requires a new API version
- Default to strict matching; use flexible matchers (`like`, `term`) only for dynamic values
