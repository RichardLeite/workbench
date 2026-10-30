# Data Exposure Audit — Reference

## PII Classification

| Category | Examples | Sensitivity |
|----------|----------|:-----------:|
| **Direct identifiers** | Name, CPF/SSN, email, phone, address | 🔴 Critical |
| **Financial** | Credit card, bank account, transaction history | 🔴 Critical |
| **Health** | Medical records, insurance data | 🔴 Critical |
| **Behavioral** | IP, user-agent, browsing history | 🟡 Medium |
| **System** | Internal IDs, timestamps, debug info | 🟢 Low |

## Common exposure patterns

### 1. IDOR (Insecure Direct Object Reference)
```http
# Vulnerable: sequential IDs enable enumeration
GET /api/users/1001/profile
GET /api/users/1002/profile

# Fix: UUID or hash-based identifiers
GET /api/users/a1b2c3d4/profile
GET /api/users/e5f6g7h8/profile
```

### 2. Token leakage
| Leak vector | Mitigation |
|-------------|------------|
| URL query params | Move token to `Authorization` header |
| Referer header | Use `rel="noreferrer"` on links |
| Browser history | Use `Cache-Control: no-store` |
| Server logs | Strip auth headers before logging |
| Error messages | Never include tokens in error responses |

### 3. Stack traces & debug info
```json
// Vulnerable response (500 error)
{
  "error": "SQLSTATE[23000]: Integrity constraint violation",
  "trace": "#0 /var/www/app/UserController.php(42): User->save()",
  "file": "/var/www/app/UserController.php",
  "line": 42
}

// Safe response
{
  "error": "An unexpected error occurred. Reference: ERR-7a3b"
}
```

### 4. Mass assignment / over-fetching
- Check if `PUT/PATCH` endpoints accept fields they shouldn't (e.g., `role`, `isAdmin`)
- Check if response includes fields not requested (e.g., password hash in user object)
- Pattern: always use DTOs / projection — never expose ORM models directly

### 5. Enumeration via error messages

| Vulnerable | Safe |
|------------|------|
| "Login failed: user not found" | "Invalid credentials" |
| "Email already registered" | "If the email exists, you will receive a confirmation" |
| "Password reset link sent" reveals if email exists | Always show same message |

## Response header checklist
- [ ] `Cache-Control: no-store` for authenticated responses
- [ ] `Content-Type: application/json; charset=utf-8` with correct charset
- [ ] `Content-Disposition: attachment` for file downloads (prevents MIME sniffing)
- [ ] Remove `X-Powered-By`, `Server` headers (reduce fingerprinting)
- [ ] `Access-Control-Allow-Origin` set to specific origin (not `*` for auth endpoints)

## Logging checklist
- [ ] No PII in application logs (mask: `email: jo**@example.com`)
- [ ] No tokens, passwords, or credit card numbers in logs
- [ ] Log retention policy defined (max 90 days)
- [ ] Audit log includes: who, what, when, source IP, success/failure
