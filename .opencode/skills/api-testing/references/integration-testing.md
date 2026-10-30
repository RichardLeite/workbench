# Integration Testing — Reference

## When to write integration tests
- Cross-service communication (API A calls API B)
- Database interactions with real (or containerized) DB
- Message queue produce/consume flows
- File upload/download with storage services

## Setup patterns

### 1. TestContainers (database integration)
```javascript
import { GenericContainer } from 'testcontainers';
import { createPool } from 'mysql2/promise';

let pool;

beforeAll(async () => {
  const container = await new GenericContainer('mysql:8.0')
    .withEnvironment({
      MYSQL_ROOT_PASSWORD: 'test',
      MYSQL_DATABASE: 'testdb'
    })
    .withExposedPorts(3306)
    .start();

  pool = createPool({
    host: container.getHost(),
    port: container.getMappedPort(3306),
    user: 'root',
    password: 'test',
    database: 'testdb'
  });
});

afterAll(async () => {
  await pool.end();
});

test('insert and retrieve user', async () => {
  await pool.execute('INSERT INTO users (name, email) VALUES (?, ?)', ['Test', 'test@test.com']);
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', ['test@test.com']);
  expect(rows).toHaveLength(1);
});
```

### 2. External API mocking (nock / MSW)
```javascript
import nock from 'nock';

beforeEach(() => {
  nock('https://api.payment-gateway.com')
    .post('/charges')
    .reply(200, { id: 'ch_123', status: 'succeeded' });
});

test('charge is created via payment gateway', async () => {
  const result = await paymentService.charge(50.00, 'tok_visa');
  expect(result.status).toBe('succeeded');
  expect(result.id).toBe('ch_123');
});
```

### 3. Service-to-service (real HTTP calls)
```javascript
test('user-service and order-service integration', async () => {
  // Create user via user-service
  const userRes = await request(userApp)
    .post('/api/v2/users')
    .send({ name: 'Test', email: 'test@test.com' });
  const userId = userRes.body.data.id;

  // Create order referencing that user via order-service
  const orderRes = await request(orderApp)
    .post('/api/v2/orders')
    .send({ userId, items: [{ productId: 1, quantity: 2 }] });

  expect(orderRes.status).toBe(201);
  expect(orderRes.body.data.userId).toBe(userId);
});
```

## Test hierarchy decision

```
Component under test
├── Pure function / no I/O → Unit test
├── Single service + database → Integration test (TestContainers)
├── Multiple services → Integration test (real or mock)
├── External API call → Integration test (nock / wiremock)
└── Full user flow + browser → E2E test (Playwright)
```

## Database cleanup strategies
| Strategy | Pros | Cons |
|----------|------|------|
| **Transaction rollback** | Fast, isolated | Not compatible with migrations that run DDL |
| **Truncate after each test** | Clean slate | Slow for large datasets |
| **Delete by test ID** | Selective cleanup | Must tag all data with test ID |
| **TestContainers per suite** | Fully isolated | Startup overhead (~10s per suite) |

## Rate-limit integration testing
```javascript
test('block after 10 failed attempts', async () => {
  const results = [];
  for (let i = 0; i < 15; i++) {
    const res = await request(app)
      .post('/api/v2/auth/login')
      .send({ email: 'test@test.com', password: 'wrong' });
    results.push(res.status);
  }
  const blockedCount = results.filter(s => s === 429).length;
  expect(blockedCount).toBeGreaterThan(0);
  expect(blockedCount).toBe(5); // after 10th attempt, next 5 blocked
});
```
