---
name: release-pipeline
description: Complete release cycle — manage release version, deploy to environment, run database migrations, and enable observability. Compõe release-management + deployment + db-migrations + observability.
composes:
  - release-management
  - deployment
  - db-migrations
  - observability
---

# Release Pipeline

## Visão Geral

Pipeline de release em **4 fases sequenciais**. A saída de cada fase alimenta a próxima.

```
Fase 1 (release-management)
  └→ Preparar release → versionar → coletar PRs incluídos
      ↓
Fase 2 (deployment)
  └→ Deploy da release tag no ambiente → health check
      ↓
Fase 3 (db-migrations)
  └→ Aplicar migrations pendentes no ambiente → validar rollback
      ↓
Fase 4 (observability)
  └→ Configurar métricas, alertas e dashboards para a release
      ↓
Consolidar → resumo final com status, warnings, duração
```

## Regras de Execução para o Orquestrador

1. **Carregar** esta pipeline skill primeiro
2. Para cada fase em `## Fases`, na ordem:
   a. Carregar a skill atômica via `skill("{nome}")`
   b. Delegar via `task` com o prompt da fase (substituindo `{{placeholders}}`)
   c. Validar o JSON de retorno
   d. Se falhou e `on_failure = "abort"` → interromper pipeline e reportar erro
   e. Se falhou e `on_failure = "continue"` → registrar aviso e prosseguir
   f. Extrair os `capture_fields` do resultado e passar para a próxima fase
3. Consolidar outputs no resumo final

---

## Fases

### Phase 1 — Release Management

| Propriedade | Valor |
|---|---|
| **Skill** | `release-management` |
| **Entrada** | Release version, changelog, target date |
| **Saída** | JSON com release tag, version, PRs included |
| **on_failure** | `abort` (sem release version não há deploy) |
| **capture_fields** | `version`, `release_tag`, `prs[]` |

#### Prompt para Delegar

```
Use a skill release-management para preparar a release {{VERSION}}.

Contexto:
- Versão: {{VERSION}}
- Changelog: {{CHANGELOG}} (se disponível)
- Target date: {{TARGET_DATE}} (se disponível)
- PRs a incluir: revisar milestones e PRs merged desde a última release

Retorne o JSON completo conforme contrato da skill release-management,
incluindo version, release_tag e prs_included.
```

#### Validação da Fase 1

O JSON retornado DEVE conter:
- `version` (string) — versão semântica da release (ex: `v2.3.0`)
- `release_tag` (string) — tag git criada (ex: `v2.3.0`)
- `prs_included` (array) — lista de PRs incluídos na release

**Se `version` ou `release_tag` ausentes** → abortar pipeline com erro de versionamento.

---

### Phase 2 — Deployment

| Propriedade | Valor |
|---|---|
| **Skill** | `deployment` |
| **Entrada** | Release tag, environment, health check URL |
| **Saída** | JSON com deploy status, URL, health check |
| **on_failure** | `abort` (sem deploy não há migrations) |
| **capture_fields** | `deploy_url`, `health_status`, `environment` |
| **Depende de** | Phase 1 concluída com sucesso |

#### Prompt para Delegar

```
Use a skill deployment para fazer deploy da release {{PHASE1.release_tag}} no ambiente {{ENVIRONMENT}}.

Contexto:
- Release tag: {{PHASE1.release_tag}}
- Ambiente: {{ENVIRONMENT}} (production | staging | homologation)
- Health check URL: {{HEALTH_CHECK_URL}} (se disponível)
- PRs incluídos nesta release: {{PHASE1.prs[].title}}

Retorne o JSON completo conforme contrato da skill deployment,
incluindo deploy_url, health_status e environment.
```

#### Validação da Fase 2

O JSON retornado DEVE conter:
- `deploy_url` (string) — URL do ambiente após deploy
- `health_status` (string) — resultado do health check (`healthy` | `unhealthy`)
- `environment` (string) — ambiente onde o deploy foi realizado

**Se `health_status !== 'healthy'`** → abortar pipeline com erro de deploy. Rollback automático deve ser acionado pela skill deployment.

---

### Phase 3 — Database Migrations

| Propriedade | Valor |
|---|---|
| **Skill** | `db-migrations` |
| **Entrada** | Environment, list of migration files |
| **Saída** | JSON com migrations aplicadas, rollback hash |
| **on_failure** | `abort` (migrations são críticas para consistência) |
| **capture_fields** | `migrations_applied[]`, `rollback_hash`, `status` |
| **Depende de** | Phase 2 concluída com sucesso |

#### Prompt para Delegar

```
Use a skill db-migrations para aplicar migrations no ambiente {{PHASE2.environment}}.

Contexto:
- Ambiente: {{PHASE2.environment}}
- Deploy URL: {{PHASE2.deploy_url}}
- Migrations pendentes: verificar migrations não aplicadas no ambiente
- Release version: {{PHASE1.version}}

Retorne o JSON completo conforme contrato da skill db-migrations,
incluindo migrations_applied, rollback_hash e status.
```

#### Validação da Fase 3

O JSON retornado DEVE conter:
- `migrations_applied` (array) — lista de migrations aplicadas com sucesso
- `rollback_hash` (string) — hash para rollback se necessário
- `status` (string) — resultado da execução (`ok` | `failed`)

**Se `status !== 'ok'`** → abortar pipeline com erro de migration. Rollback deve ser executado usando o `rollback_hash` retornado.

---

### Phase 4 — Observability

| Propriedade | Valor |
|---|---|
| **Skill** | `observability` |
| **Entrada** | Deploy URL, environment, release version |
| **Saída** | JSON com metrics, logs, alerts configurados |
| **on_failure** | `continue` (observabilidade pode ser configurada depois) |
| **capture_fields** | `metrics_status`, `alerts_configured`, `dashboards[]` |
| **Depende de** | Phase 2 concluída com sucesso (independente da Phase 3) |

#### Prompt para Delegar

```
Use a skill observability para configurar monitoramento da release {{PHASE1.version}} no ambiente {{PHASE2.environment}}.

Contexto:
- Deploy URL: {{PHASE2.deploy_url}}
- Ambiente: {{PHASE2.environment}}
- Release version: {{PHASE1.version}}
- Migrations aplicadas: {{PHASE3.migrations_applied[]}} (se houver)
- Métricas a monitorar: error rate, response time, throughput, health check

Retorne o JSON completo conforme contrato da skill observability,
incluindo metrics_status, alerts_configured e dashboards.
```

#### Validação da Fase 4

O JSON retornado DEVE conter:
- `metrics_status` (string) — status da configuração de métricas
- `alerts_configured` (number) — quantidade de alertas configurados
- `dashboards` (array) — dashboards atualizados/criados

**Se falhar** → registrar aviso e prosseguir. Observabilidade não bloqueia a release.

---

## Output Consolidado

Após todas as fases, montar o resumo final:

```json
{
  "pipeline": "release-pipeline",
  "status": "success|partial|failed",
  "phases": {
    "release": {
      "status": "success|failed",
      "version": "v2.3.0",
      "release_tag": "v2.3.0",
      "prs_count": 12
    },
    "deploy": {
      "status": "success|failed",
      "environment": "production",
      "deploy_url": "https://app.example.com",
      "health_status": "healthy"
    },
    "migrations": {
      "status": "success|skipped|failed",
      "migrations_applied": ["20240625-add-column"],
      "rollback_hash": "abc123"
    },
    "observability": {
      "status": "success|skipped|failed",
      "metrics_status": "active",
      "alerts_configured": 3,
      "dashboards_updated": 1
    }
  },
  "summary": {
    "message": "Release v2.3.0 deployed to production. 1 migration applied, monitoring active.",
    "warnings": [],
    "duration_minutes": 25
  }
}
```

## Modos de Ativação

| Modo | Exemplo de input | Fluxo |
|---|---|---|
| **Release completa** | `release v2.3.0 production` | Fase 1 → 2 → 3 → 4 (pipeline completa) |
| **Deploy apenas** | `deploy v2.3.0 staging` | Pula Fase 1 (tag já existe) → 2 → 3 → 4 |
| **Hotfix** | `hotfix v2.3.1 production` | Fase 1 (versionamento rápido) → 2 → 3 → 4 |
| **Dry run** | `release v2.3.0 --dry-run` | Fase 1 → valida pré-requisitos → aborta antes do deploy |

## Guardrails da Pipeline

1. **Pre-flight**: verificar se há migrations pendentes antes do deploy
2. **Phase 1 aborta se release falhar** — sem release version não há deploy
3. **Phase 2 aborta se health check falhar** — rollback automático acionado pela skill deployment
4. **Phase 3 aborta se migration falhar** — rollback necessário usando `rollback_hash`
5. **Phase 4 continua mesmo se falhar** — observabilidade não bloqueia release, pode ser configurada depois
6. **Nunca pular fases** — execute sempre na ordem definida (exceto modo "Deploy apenas")
7. **Output consolidado sempre apresentado** — mesmo se fase falhar

## Cache e Repetição

- Se Phase 1 já foi executada (mesma version), perguntar se quer re-versionar ou pular
- Se Phase 2 já fez deploy da mesma tag no mesmo ambiente, alertar e perguntar se quer re-deployar
- Se Phase 3 já aplicou as migrations (idempotente por natureza), pular automaticamente
- Se Phase 4 já configurou observabilidade para a versão, perguntar se quer reconfigurar ou pular
