---
name: security-pipeline
description: Security audit pipeline — audit REST API security, audit database access controls, and verify LGPD compliance. Compõe security-audit-api + security-audit-database + security-lgpd.
composes:
  - security-audit-api
  - security-audit-database
  - security-lgpd
---

# Security Pipeline

## Visão Geral

Pipeline de auditoria de segurança em **3 fases sequenciais**. Cada fase é independente — falhas não abortam as demais.

```
Fase 1 (security-audit-api)
  └→ Auditar endpoints, autenticação, rate limiting → vulnerabilidades API
      ↓
Fase 2 (security-audit-database)
  └→ Auditar schemas, RLS policies, padrões de query → riscos de banco
      ↓
Fase 3 (security-lgpd)
  └→ Verificar campos PII, fluxos de dados, consentimento → conformidade LGPD
      ↓
  Consolidar → resumo final com severidade, riscos, recomendações priorizadas
```

## Regras de Execução para o Orquestrador

1. **Carregar** esta pipeline skill primeiro
2. Para cada fase em `## Fases`, na ordem:
   a. Carregar a skill atômica via `skill("{nome}")`
   b. Delegar via `task` com o prompt da fase (substituindo `{{placeholders}}`)
   c. Validar o JSON de retorno
   d. Se falhou e `on_failure = "abort"` → interromper pipeline e reportar erro
   e. Se falhou e `on_failure = "continue"` → registrar aviso e prosseguir
   f. Extrair os `capture_fields` do resultado e acumular para o output consolidado
 3. Consolidar outputs no resumo final

---

## Fases

### Phase 1 — API Security Audit

| Propriedade | Valor |
|---|---|
| **Skill** | `security-audit-api` |
| **Entrada** | API endpoints, auth config, rate limit config |
| **Saída** | JSON com vulnerabilidades, severidade, recomendações |
| **on_failure** | `continue` (auditar o que for possível, reportar o resto) |
| **capture_fields** | `vulnerabilidades[]`, `severidade_geral`, `recomendacoes[]` |

#### Prompt para Delegar

```
Use skill security-audit-api para auditar a segurança da API.

Contexto:
- Endpoints: {{ENDPOINTS}}
- Autenticação: {{AUTH_CONFIG}}
- Rate limiting: {{RATE_LIMIT_CONFIG}}

Retorne JSON com vulnerabilidades, severidade_geral (alta/media/baixa), recomendacoes.
```

#### Validação da Fase 1

O JSON retornado DEVE conter:
- `vulnerabilidades` (array) — lista de vulnerabilidades encontradas (pode ser vazio)
- `severidade_geral` (string) — `alta`, `media`, ou `baixa`
- `recomendacoes` (array) — lista de recomendações

**Reportar `severidade_geral` mesmo se `vulnerabilidades` estiver vazio** (indica API segura ou auditada parcialmente).

---

### Phase 2 — Database Security Audit

| Propriedade | Valor |
|---|---|
| **Skill** | `security-audit-database` |
| **Entrada** | Database schema, RLS policies, access patterns |
| **Saída** | JSON com SQL injection vectors, access control issues |
| **on_failure** | `continue` (auditar o que for possível) |
| **capture_fields** | `sql_risks[]`, `access_issues[]`, `recomendacoes[]` |
| **Depende de** | Nenhuma (independente da Fase 1) |

#### Prompt para Delegar

```
Use skill security-audit-database para auditar a segurança do banco de dados.

Contexto:
- Schemas: {{DB_SCHEMAS}}
- Políticas de acesso: {{RLS_POLICIES}}
- Padrões de query: {{QUERY_PATTERNS}}

Retorne JSON com sql_risks, access_issues, recomendacoes.
```

#### Validação da Fase 2

O JSON retornado DEVE conter:
- `sql_risks` (array) — vetores de SQL injection identificados
- `access_issues` (array) — problemas de controle de acesso
- `recomendacoes` (array) — recomendações de mitigação

**Se nenhum risco encontrado, reportar arrays vazios com status `success`.**

---

### Phase 3 — LGPD Compliance Check

| Propriedade | Valor |
|---|---|
| **Skill** | `security-lgpd` |
| **Entrada** | PII fields, data retention, consent flows |
| **Saída** | JSON com conformidade LGPD, gap analysis |
| **on_failure** | `continue` (reportar o que encontrar) |
| **capture_fields** | `pii_fields[]`, `non_compliant[]`, `recomendacoes[]` |
| **Depende de** | Nenhuma (independente das Fases 1 e 2) |

#### Prompt para Delegar

```
Use skill security-lgpd para verificar conformidade LGPD.

Contexto:
- Campos PII: {{PII_FIELDS}}
- Fluxos de dados: {{DATA_FLOWS}}
- Consentimento: {{CONSENT_FLOWS}}

Retorne JSON com pii_fields, non_compliant, recomendacoes.
```

#### Validação da Fase 3

O JSON retornado DEVE conter:
- `pii_fields` (array) — campos de dados pessoais identificados
- `non_compliant` (array) — itens não-conformes com LGPD
- `recomendacoes` (array) — recomendações de adequação

**Se nenhum campo PII encontrado, reportar arrays vazios com status `success`.**

---

## Output Consolidado

Após as 3 fases, montar o resumo final:

```json
{
  "pipeline": "security-pipeline",
  "status": "success|partial|failed",
  "phases": {
    "api_audit": {
      "status": "success|failed|skipped",
      "severidade_geral": "media",
      "vulnerabilidades_count": 3,
      "recomendacoes_count": 5
    },
    "database_audit": {
      "status": "success|failed|skipped",
      "sql_risks_count": 1,
      "access_issues_count": 2,
      "recomendacoes_count": 3
    },
    "lgpd_check": {
      "status": "success|failed|skipped",
      "pii_fields_count": 12,
      "non_compliant_count": 1,
      "recomendacoes_count": 2
    }
  },
  "summary": {
    "message": "Security audit complete. API: 3 vulnerabilidades (média), DB: 1 SQL risk, LGPD: 1 não-conformidade.",
    "warnings": ["Revisar SQL injection vector no módulo de relatórios"],
    "duration_minutes": 15,
    "prioridade_geral": "media"
  }
}
```

### Regras do Output Consolidado

- `status` = `success` se todas as fases retornaram `success`
- `status` = `partial` se pelo menos 1 fase retornou `success` e pelo menos 1 falhou
- `status` = `failed` se todas as fases falharam
- `summary.warnings` acumula alertas de todas as fases, mesmo as que falharam
- `summary.prioridade_geral` = maior severidade entre todas as fases (`alta` > `media` > `baixa`)
- Recomendações são priorizadas por severidade no output final

## Modos de Ativação

| Modo | Exemplo de input | Fluxo |
|---|---|---|
| **Completo** | `auditar segurança` | Fase 1 → Fase 2 → Fase 3 |
| **API only** | `auditar segurança da API` | Fase 1 apenas |
| **Database only** | `auditar segurança do banco` | Fase 2 apenas |
| **LGPD only** | `verificar conformidade LGPD` | Fase 3 apenas |

## Guardrails da Pipeline

1. **Todas as fases usam `on_failure: continue`** — auditar o máximo possível, nunca abortar
2. **Relatório consolidado inclui alertas de todas as fases**, mesmo as que falharam
3. **Recomendações são priorizadas por severidade** no output final
4. **Output consolidado sempre apresentado** — mesmo se todas as fases falharem
5. **Nenhuma fase modifica o código** — apenas análise read-only
6. **Fases são independentes** — qualquer fase pode ser executada isoladamente
7. **Nunca pular fases no modo completo** — execute sempre na ordem definida (1 → 2 → 3)

## Cache e Repetição

- Se uma fase já foi executada no mesmo contexto (mesmo projeto, mesmo escopo), perguntar se quer re-auditar ou usar resultado anterior
- Resultados de auditoria são válidos até a próxima mudança de código relevante (endpoints, schemas, fluxos de dados)
