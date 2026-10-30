---
name: db-migrations
description: Apply safe migrations with rollback and lock awareness.
---

## Goal
Apply safe migrations with rollback and lock awareness.

## Procedure
1. Identify data criticality and table size.
2. Design migration for minimal lock time.
3. Define rollback script before apply.
4. Validate in staging-like environment.
5. Run migration with monitoring.
6. Validate schema and data consistency.
7. Attach evidence (query plans, logs, timings).

## Required checklist
- lock risk assessed
- rollback tested
- backward compatibility verified
- hot path queries rechecked

## Mandatory timestamp fields

Every new table must define `createdAt` and `updatedAt` with explicit defaults:

```js
createdAt: {
  type: Sequelize.DATE,
  allowNull: false,
  defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
},
updatedAt: {
  type: Sequelize.DATE,
  allowNull: false,
  defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
},
```

**Why**
- Guarantees non-null values on raw SQL inserts (without relying on Sequelize/ORM layer)
- Protects against manual inserts or bulk imports that bypass the ORM
- Keeps the table safe regardless of write path (ORM, raw SQL, or trigger)
- Is the established pattern for all new tables in this repository

**Anti-patterns to avoid**
- `allowNull: false` without `defaultValue` — requires ORM to fill the value
- `defaultValue: undefined` — relies on implicit DB defaults
- `defaultValue: Sequelize.NOW` — not portable across DB engines
