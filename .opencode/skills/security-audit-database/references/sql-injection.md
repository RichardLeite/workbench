# SQL Injection — Reference

## What to look for

### Dangerous patterns in code

```javascript
// ❌ String concatenation
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ❌ Template literals with user input
db.query(`UPDATE products SET price = ${req.body.price} WHERE id = ${id}`);

// ❌ Dynamic table/column names
const query = `SELECT ${columns} FROM ${table} WHERE id = $1`;

// ✅ Parameterized query
db.query('SELECT * FROM users WHERE email = $1', [email]);

// ✅ ORM usage (Sequelize/Prisma)
User.findOne({ where: { email } });
```

### Obfuscation techniques attackers use
- `UNION/**/SELECT` — inline comments bypass space filters
- `'||' OR '1'='1` — concatenation tricks
- `0xHEX` — hex encoding of strings
- `CHAR(65)+CHAR(100)+CHAR(109)` — char encoding
- `WAITFOR DELAY '0:0:5'` — time-based blind injection

## Injection test vectors

### Generic tests
```sql
' OR '1'='1
' OR 1=1--
admin' --
1' ORDER BY 1--
1' ORDER BY 10--   (column enumeration)
1' UNION SELECT NULL, NULL, NULL--
1' UNION SELECT table_name, NULL FROM information_schema.tables--
```

### Database-specific

| Database | Test vector |
|----------|-------------|
| MySQL | `' OR SLEEP(5)--` |
| PostgreSQL | `' OR pg_sleep(5)--` |
| SQL Server | `' WAITFOR DELAY '0:0:5'--` |
| SQLite | `' AND randomblob(1000000)--` |

### JSON/NoSQL injection
```json
// MongoDB NoSQL injection
{ "email": { "$gt": "" }, "password": { "$ne": "" } }
{ "$where": "this.password.length > 0" }
{ "username": "admin", "password": { "$regex": ".*" } }
```

## Prevention

### 1. Parameterized queries (always)
```javascript
// Node.js (pg)
const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);

// Node.js (mysql2)
const [rows] = await connection.execute('SELECT * FROM users WHERE id = ?', [id]);

// Python
cursor.execute("SELECT * FROM users WHERE email = %s", (email,))

// Java (JDBC)
PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE id = ?");
ps.setInt(1, id);
```

### 2. ORM safety
- Sequelize: use model methods (`findByPk`, `findAll`) — avoid `sequelize.query()` for user input
- Prisma: safe by default, but raw queries need `$queryRawUnsafe` (never use with string interpolation)
- TypeORM: use `FindOptionsWhere`, avoid raw `query()` with concatenation

### 3. Input validation
- Validate types: `parseInt(id, 10)` for integer parameters
- Whitelist expected values for enum fields
- Reject unexpected characters in identifiers (no semicolons, dashes, spaces)

## Testing tools
- **SQLMap**: `sqlmap -u "https://api.example.com/users?id=1" --batch`
- **Burp Suite**: Intruder with SQL injection payloads
- **Semgrep**: custom rules to detect string concatenation in queries

## Checklist
- [ ] No raw string concatenation in query builders
- [ ] Prepared statements or parameterized queries everywhere
- [ ] Input validation before database operations
- [ ] ORM used consistently (avoid `queryRaw` with user input)
- [ ] Stored procedures also parameterized
- [ ] No dynamic table/column names from user input
- [ ] Database user has only required permissions (no DROP/CREATE)
