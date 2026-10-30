# Row-Level Security (RLS) — Reference

## What is RLS
Row-Level Security restricts which rows a user can access based on a policy predicate. Essential for multi-tenant databases where a single table stores data for multiple tenants.

## PostgreSQL RLS

### Enabling RLS
```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;  -- also for table owner
```

### Policy types
```sql
-- SELECT policy: user can only see their own orders
CREATE POLICY user_orders ON orders
  FOR SELECT
  USING (user_id = current_setting('app.current_user_id')::int);

-- INSERT policy: user can only insert with their own user_id
CREATE POLICY user_insert ON orders
  FOR INSERT
  WITH CHECK (user_id = current_setting('app.current_user_id')::int);

-- ALL policy covering all operations
CREATE POLICY tenant_isolation ON documents
  USING (tenant_id = current_setting('app.tenant_id')::int);
```

### Common pitfalls
| Pitfall | Impact | Fix |
|---------|--------|-----|
| RLS not enabled on table | All rows visible | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` |
| RLS bypassed via views | View hides RLS from caller | Add `SECURITY_INVOKER` to view |
| Bypass via functions | Function runs with definer rights | Use `SECURITY DEFINER` cautiously or set `app.current_user_id` |
| Policy too permissive | `USING (true)` defeats RLS | Always scope to current user/tenant |
| Owner bypass | Superuser/owner ignores RLS | Use `FORCE ROW LEVEL SECURITY` |

### Testing RLS
```sql
-- Switch to restricted role
SET ROLE app_user;
SET app.current_user_id = '5';

-- Verify user 5 can only see their rows
SELECT * FROM orders;

-- Attempt cross-tenant access
SET app.current_user_id = '99999';
SELECT * FROM orders;  -- should return empty
```

## Supabase RLS (PostgreSQL-based)

```sql
-- Common pattern: using auth.uid()
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Using a join to check tenant membership
CREATE POLICY "Team members can view documents"
  ON documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = documents.team_id
      AND team_members.user_id = auth.uid()
    )
  );
```

## MySQL / SQL Server equivalents

MySQL does not have native RLS. Alternatives:
- **Views with `WHERE user_id = @current_user`** — create per-role views
- **Application-layer filtering** — always scope queries
- **ProxySQL or middleware** — rewrite queries on the fly

SQL Server has **Row-Level Security** via `CREATE SECURITY POLICY` with inline function predicates.

## Checklist
- [ ] RLS enabled on every multi-tenant table
- [ ] `FORCE RLS` applied (no owner bypass)
- [ ] Policy functions are STABLE/IMMUTABLE (performance)
- [ ] Policies tested with multiple tenant IDs
- [ ] Views and functions respect RLS (SECURITY_INVOKER)
- [ ] Application sets session variables before queries
- [ ] No `USING (true)` or permissive catch-all policies
