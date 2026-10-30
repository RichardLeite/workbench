# Authentication Audit — Reference

## JWT (JSON Web Tokens)

### Common vulnerabilities
| Issue | How to test | Severity |
|-------|-------------|:--------:|
| `alg: none` | Modify JWT header to `{"alg":"none"}`, remove signature | P0 |
| Weak/leaked secret | Crack with `hashcat` or `jwt_tool`; check `.env` exposure | P0 |
| Missing `exp` claim | Use expired token; check if validated | P1 |
| Missing `aud` claim | Reuse token from one service against another | P1 |
| `kid` injection | Set `kid` to path traversal (`../../etc/passwd`) | P0 |

### Testing tools
```
jwt_tool <token> -T                  # tamper
jwt_tool <token> -C -d wordlist.txt  # crack secret
jwt.io debugger                       # manual decode
```

## OAuth 2.0 / OIDC

### Attack vectors
- **CSRF on authorization flow**: no `state` parameter → attacker can inject authorization code
- **Redirect URI tampering**: open redirect in `redirect_uri` → steal code
- **Token leakage via Referer header**: OAuth callback URL leaks tokens in `Referer`
- **Scope escalation**: modify `scope` param to request elevated permissions

### Checklist
- [ ] `state` parameter present and validated
- [ ] `redirect_uri` whitelisted (exact match, not prefix)
- [ ] `redirect_uri` validated before code exchange
- [ ] PKCE enforced for public clients
- [ ] Token bound to client ID (audience check)
- [ ] `id_token` signature verified

## API Keys

### Issues
| Issue | Test | Severity |
|-------|------|:--------:|
| Hardcoded in code/commit history | Search for `api_key`, `apikey`, `sk-` patterns | P0 |
| Sent in URL query params | Check if key appears in server logs / Referer | P1 |
| No rotation mechanism | Ask: can keys be rotated without downtime? | P2 |
| Excessive permissions | Does the key have read/write access it doesn't need? | P1 |

## Session-based auth

- [ ] Session ID entropy sufficient (≥128 bits, CSPRNG generated)
- [ ] Session ID rotated on login/logout (no session fixation)
- [ ] `HttpOnly`, `Secure`, `SameSite` flags on cookies
- [ ] Session timeout implemented (idle + absolute)
- [ ] Concurrent session limit enforced
