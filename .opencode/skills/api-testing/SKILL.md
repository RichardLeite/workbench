---
name: api-testing
description: Contract testing, response validation, rate-limit testing, integration testing for REST/GraphQL APIs. Use when testing API endpoints or writing integration tests.
category: development
---

# API Testing

## Goal
Implement comprehensive API testing — contract validation, response schema checks, rate-limit verification, and integration testing for REST and GraphQL APIs.

## When to use
- Testing API endpoints or writing integration tests
- "add contract tests" or "validate API responses"
- Ensuring backward compatibility across API versions
- Setting up CI pipeline for API quality gates

## Procedure

### 1. Test Categories & Strategy

| Category | What it validates | Tool | Priority |
|----------|------------------|------|:--------:|
| **Contract** | Response schema, required fields, types | Pact / OpenAPI validator | P0 |
| **Functional** | Business logic, status codes, error shapes | Supertest / Jest | P0 |
| **Integration** | Cross-service flows, database interactions | Test containers | P1 |
| **Rate-limit** | 429 behavior, Retry-After, backoff | k6 / autocannon | P1 |
| **Security** | Auth bypass, injection, CORS | OWASP ZAP | P1 |

### 2. Contract Testing (OpenAPI/Swagger)
```javascript
// Using openapi-response-validator
import OpenAPIResponseValidator from 'openapi-response-validator';
import spec from './api-spec.yaml';

const validator = new OpenAPIResponseValidator({
  responses: spec.paths['/users/{id}'].get.responses
});

test('GET /users/:id returns valid schema', async () => {
  const res = await request(app).get('/api/v2/users/1');
  expect(res.status).toBe(200);
  const result = validator.validateResponse(200, res.body);
  expect(result).toBeNull(); // null = valid
});
```

### 3. Functional Testing
```javascript
// Using Supertest
import request from 'supertest';
import app from '../app';

describe('POST /api/v2/auth/login', () => {
  it('returns 200 with token for valid credentials', async () => {
    const res = await request(app)
      .post('/api/v2/auth/login')
      .send({ email: 'user@test.com', password: 'validPass123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data.token');
    expect(res.body.data.token).toMatch(/^eyJ/);  // JWT pattern
  });

  it('returns 401 for invalid credentials', async () => {
    const res = await request(app)
      .post('/api/v2/auth/login')
      .send({ email: 'wrong@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 429 after too many attempts', async () => {
    for (let i = 0; i < 15; i++) {
      await request(app).post('/api/v2/auth/login')
        .send({ email: 'test@test.com', password: 'wrong' });
    }
    const res = await request(app).post('/api/v2/auth/login')
      .send({ email: 'test@test.com', password: 'wrong' });
    expect(res.status).toBe(429);
    expect(res.headers).toHaveProperty('retry-after');
  });
});
```

### 4. GraphQL Testing
```javascript
describe('GraphQL API', () => {
  it('returns expected shape for user query', async () => {
    const query = `
      query GetUser($id: ID!) {
        user(id: $id) { id name email }
      }
    `;
    const res = await request(app)
      .post('/graphql')
      .send({ query, variables: { id: '1' } });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      id: '1', name: expect.any(String), email: expect.any(String)
    });
  });

  it('rejects unauthorized queries', async () => {
    const query = `{ adminPanel { users { email } } }`;
    const res = await request(app)
      .post('/graphql')
      .send({ query });
    expect(res.body.errors[0].message).toMatch(/unauthorized/i);
  });
});
```

### 5. Rate-Limit Testing
```bash
# Using k6
k6 run --vus 50 --duration 30s k6-scripts/login-endpoint.js

# Using autocannon
autocannon -c 100 -d 20 http://localhost:3000/api/v2/auth/login
```

## Response Validation Checklist
- [ ] Status codes match conventions (200, 201, 400, 401, 403, 404, 409, 422, 429, 500)
- [ ] Error format follows `{ error: { code, message, details? } }` pattern
- [ ] Paginated responses have `{ data, pagination: { page, limit, total, totalPages } }`
- [ ] No extra or missing fields compared to OpenAPI spec
- [ ] Dates in ISO 8601 format
- [ ] IDs match expected type (int, UUID, etc.)

## References
- [Contract Testing](references/contract-testing.md) — OpenAPI validation, Pact, consumer-driven contracts
- [Integration Testing](references/integration-testing.md) — Service-to-service, database, external API mocking
