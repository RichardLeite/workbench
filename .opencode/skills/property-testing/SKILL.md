# Property-Based Testing (fast-check)

> Use when you need to validate **behavioral invariants** with automatically generated
> inputs — instead of manually written example-based tests.

## Installation

```bash
cd meu-projeto-api
yarn add --dev fast-check
```

## When to Use

| Replace example-based test | With property-based test |
|---|---|
| `it('should return 400 for negative id')` | `it('should never crash for any integer id')` |
| `it('should format CPF correctly for 123.456.789-09')` | `it('should always produce 11-digit CPF for any valid input')` |
| `it('should calculate tax for 100.00')` | `it('should always return a positive tax for any positive amount')` |

## Anatomy of a Property Test

```javascript
const fc = require('fast-check');

describe('CustomerService', () => {
  describe('calculateDiscount', () => {
    it('should always return a value between 0 and the original price', () => {
      fc.assert(
        fc.property(fc.float({ min: 0, max: 10000 }), fc.float({ min: 0, max: 1 }), (price, discountRate) => {
          const result = CustomerService.calculateDiscount(price, discountRate);
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(price);
        })
      );
    });

    it('should never throw for valid inputs', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1e6 }),
          fc.float({ min: 0, max: 1 }),
          (price, rate) => {
            expect(() => CustomerService.calculateDiscount(price, rate)).not.toThrow();
          }
        )
      );
    });
  });
});
```

## Common Arbitraries (Generators)

| Generator | Description | Example |
|-----------|-------------|---------|
| `fc.integer()` | Any integer | `fc.integer({ min: 1, max: 99999 })` |
| `fc.float()` | Any float | `fc.float({ min: 0, max: 1e6 })` |
| `fc.string()` | Any string | `fc.string({ minLength: 1, maxLength: 100 })` |
| `fc.boolean()` | true/false | `fc.boolean()` |
| `fc.date()` | Any date | `fc.date({ min: new Date('2020-01-01') })` |
| `fc.array()` | Array of X | `fc.array(fc.integer(), { maxLength: 10 })` |
| `fc.oneof()` | Pick one of | `fc.oneof(fc.string(), fc.integer())` |
| `fc.record()` | Object with shape | `fc.record({ name: fc.string(), age: fc.integer() })` |
| `fc.emailAddress()` | Valid email | `fc.emailAddress()` |
| `fc.uuid()` | UUID v4 | `fc.uuid()` |

## Patterns by Domain

### 1. Validation/Formatting

```javascript
it('CPF should always have 11 digits after formatting', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 11, maxLength: 11 }), (raw) => {
      const formatted = formatCpf(raw);
      expect(formatted.replace(/\D/g, '')).toHaveLength(11);
    })
  );
});
```

### 2. Business Rules (Finance)

```javascript
it('total should always equal sum of items', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          quantity: fc.integer({ min: 1, max: 100 }),
          unitPrice: fc.float({ min: 0.01, max: 10000 }),
        }),
        { maxLength: 20 }
      ),
      (items) => {
        const sale = SaleService.calculateTotal(items);
        const expected = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
        expect(sale.total).toBeCloseTo(expected, 2);
      }
    )
  );
});
```

### 3. Idempotency / Round-Trip

```javascript
it('serialization round-trip should preserve object shape', () => {
  fc.assert(
    fc.property(
      fc.record({
        id: fc.integer({ min: 1 }),
        name: fc.string({ maxLength: 50 }),
        email: fc.emailAddress(),
      }),
      (customer) => {
        const serialized = JSON.stringify(customer);
        const deserialized = JSON.parse(serialized);
        expect(deserialized).toEqual(customer);
      }
    )
  );
});
```

## Integration with Existing Tests

Property tests **complement** example-based tests — they don't replace them:

```
describe('CustomerService.findByEmail', () => {
  // ✅ Example-based (precise, readable)
  it('should find by exact email', async () => { ... });

  // ✅ Property-based (broad, catches edge cases)
  it('should always return a customer with matching email', async () => {
    fc.assert(
      fc.property(fc.emailAddress(), async (email) => {
        const customer = await CustomerService.findByEmail(email);
        if (customer) expect(customer.email).toBe(email);
        // null is OK — not all emails exist in DB
      })
    );
  });
});
```

## Running

```bash
# All tests
yarn test

# Specific property test
yarn test -- --testPathPattern=property

# With more iterations (default: 100)
yarn test -- --testPathPattern=discount --verbose
```

## Customizing Iterations

```javascript
fc.assert(
  fc.property(arbitrary, (value) => {
    // ...
  }),
  { numRuns: 1000 } // ← increase from default 100
);
```

## Best Practices

1. **Start with simple properties** — "never throws" and "returns correct type" are easy wins
2. **Test the invariant, not the implementation** — property tests validate the "what", not the "how"
3. **Keep seed reproducibility** — fast-check prints the seed on failure; use `fc.assert(..., { seed: 42 })` to replay
4. **Shrink failures** — fast-check automatically finds minimal failing input; report it in the bug
5. **Don't test I/O** — mock database/external calls; property tests are for pure logic
6. **Run with higher iterations** in CI — `numRuns: 1000` for thoroughness
