---
name: security-check
description: Verificação de segurança antes de deploy ou PR — OWASP, secrets, auth
---

# Security Check

## Objetivo
Verificar segurança de código antes de deploy ou PR.

## Quando usar
- Antes de deploy em produção
- PR que toca em auth, pagamento, PII
- PR com mudanças em APIs externas
- Qualquer PR que o revisor julgar necessário

## Processo
1. **Secrets scan**: Verificar tokens, senhas, chaves no diff
2. **Auth review**: Verificar JWT, sessão, RBAC por endpoint
3. **Injection check**: SQL parametrizado? XSS prevention?
4. **Dependencies**: `npm audit` ou equivalente
5. **API security**: CORS, rate limit, headers
6. **Privacidade**: Dados pessoais? Base legal?

## Gatilhos de Segurança

Toda task que envolver **DEVE** acionar security-reviewer ou sec-arch:
- Auth, login, cadastro
- Pagamento, financeiro, fiscal
- Dados pessoais (LGPD/GDPR)
- Integração externa com tokens
- Secrets, chaves de API
- Permissões, RBAC
- Multi-tenant

## Agentes que usam
- `security-reviewer` (código)
- `sec-arch` (design review pré-código)
- `code-reviewer` (revisão geral pós-segurança)
