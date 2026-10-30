---
name: quality-pipeline
description: Quality assurance pipeline — run QA test plan, execute API contract tests, and validate E2E with Playwright. Compõe qa-test + api-testing + playwright-testing.
composes:
  - qa-test
  - api-testing
  - playwright-testing
---

# Quality Pipeline

## Visão Geral

Pipeline de garantia de qualidade em **3 fases**, com Phase 1 sequencial e Phase 2 + 3 em paralelo. A saída da Fase 1 alimenta as Fases 2 e 3.

```
Fase 1 (qa-test)
  └→ Gerar plano de teste → funcionalidades, casos, cobertura
      ↓
Fase 2 (api-testing) ──┐
  └→ Validar contratos  │  PARALELO
Fase 3 (playwright-testing) ─┘
  └→ Executar testes E2E
      ↓
Consolidar → resumo final com pass rates, falhas, screenshots
```

## Regras de Execução para o Orquestrador

1. **Carregar** esta pipeline skill primeiro
2. **Fase 1** (obrigatória, sequencial):
   a. Carregar a skill atômica via `skill("qa-test")`
   b. Delegar via `task` com o prompt da fase (substituindo `{{placeholders}}`)
   c. Validar o JSON de retorno
   d. Se falhou → **abortar pipeline** (sem plano não há execução)
   e. Extrair os `capture_fields` do resultado e passar para as próximas fases
3. **Fase 2 + Fase 3** (paralelo, independentes):
   a. Carregar as skills atômicas via `skill("api-testing")` e `skill("playwright-testing")`
   b. Delegar ambas em paralelo com os prompts das fases
   c. Validar os JSONs de retorno
   d. Se falharam → registrar aviso e prosseguir (`on_failure = "continue"`)
   e. Extrair os `capture_fields` dos resultados
4. Consolidar outputs no resumo final

---

## Fases

### Phase 1 — Test Plan (QA)

| Propriedade | Valor |
|---|---|
| **Skill** | `qa-test` |
| **Entrada** | Feature spec, changed files, test scope |
| **Saída** | JSON com test plan, casos de teste, cobertura |
| **on_failure** | `abort` (sem plano não há execução) |
| **capture_fields** | `funcionalidades[]`, `casos[]`, `cobertura_estimada` |

#### Prompt para Delegar

```
Use a skill qa-test para gerar o plano de teste para a feature {{FEATURE}}.

Contexto:
- Feature spec: {{FEATURE_SPEC}}
- Arquivos alterados: {{CHANGED_FILES}}
- Escopo de teste: {{TEST_SCOPE}}

Retorne o JSON completo conforme contrato da skill qa-test,
incluindo funcionalidades, casos de teste, cobertura_estimada e riscos.
```

#### Validação da Fase 1

O JSON retornado DEVE conter:
- `funcionalidades` (array) — pelo menos 1 funcionalidade
- `casos` (array) — pelo menos 1 caso de teste
- `cobertura_estimada` (string) — percentual estimado

**Se `funcionalidades` ou `casos` estiverem vazios** → abortar pipeline com erro de plano insuficiente.

---

### Phase 2 — API Contract Testing

| Propriedade | Valor |
|---|---|
| **Skill** | `api-testing` |
| **Entrada** | API endpoints, contracts, test scenarios |
| **Saída** | JSON com resultados dos testes de API |
| **on_failure** | `continue` (testes de API são importantes mas não bloqueiam E2E) |
| **capture_fields** | `results[]`, `pass_rate`, `failures[]` |
| **Paralelo com** | Phase 3 |

#### Prompt para Delegar

```
Use a skill api-testing para validar os contratos de API da feature {{FEATURE}}.

Contexto:
- Endpoints afetados: {{AFFECTED_ENDPOINTS}}
- Cenários do plano de teste: {{PHASE1.casos}}
- Escopo: {{TEST_SCOPE}}

Retorne o JSON completo conforme contrato da skill api-testing,
incluindo results, pass_rate e failures.
```

#### Validação da Fase 2

O JSON retornado DEVE conter:
- `results` (array) — resultados por endpoint testado
- `pass_rate` (string) — percentual de testes que passaram
- `failures` (array) — lista de falhas (pode estar vazio)

**Se a Fase 2 falhar** → registrar aviso e prosseguir. E2E não depende de API.

---

### Phase 3 — E2E Playwright Testing

| Propriedade | Valor |
|---|---|
| **Skill** | `playwright-testing` |
| **Entrada** | E2E scenarios, page objects, test config |
| **Saída** | JSON com resultados dos testes E2E |
| **on_failure** | `continue` (E2E falham por fatores externos; QA review manual) |
| **capture_fields** | `results[]`, `pass_rate`, `screenshots[]` |
| **Paralelo com** | Phase 2 |

#### Prompt para Delegar

```
Use a skill playwright-testing para executar os testes E2E da feature {{FEATURE}}.

Contexto:
- Cenários do plano de teste: {{PHASE1.casos}}
- Configuração de teste: {{TEST_CONFIG}}
- Escopo: {{TEST_SCOPE}}

Retorne o JSON completo conforme contrato da skill playwright-testing,
incluindo results, pass_rate e screenshots das falhas.
```

#### Validação da Fase 3

O JSON retornado DEVE conter:
- `results` (array) — resultados por cenário E2E executado
- `pass_rate` (string) — percentual de testes que passaram
- `screenshots` (array) — caminhos dos screenshots de falha (pode estar vazio)

**Se a Fase 3 falhar** → registrar aviso e prosseguir. API não depende de E2E.

---

## Output Consolidado

Após todas as fases, montar o resumo final:

```json
{
  "pipeline": "quality-pipeline",
  "status": "success|partial|failed",
  "phases": {
    "test_plan": {
      "status": "success|failed",
      "functionalidades": 5,
      "casos_count": 15,
      "cobertura_estimada": "80%"
    },
    "api_tests": {
      "status": "success|failed|skipped",
      "pass_rate": "95%",
      "total": 20,
      "failures": 1
    },
    "e2e_tests": {
      "status": "success|failed|skipped",
      "pass_rate": "100%",
      "total": 10,
      "screenshots": 0
    }
  },
  "summary": {
    "message": "Quality pipeline complete. API: 95% pass (1 falha), E2E: 100% pass.",
    "warnings": ["1 API test falhou — revisar manualmente"],
    "duration_minutes": 18
  }
}
```

## Modos de Ativação

| Modo | Exemplo de input | Fluxo |
|---|---|---|
| **Completo** | `feature: checkout` | Fase 1 → Fase 2 + 3 em paralelo |
| **API only** | `feature: checkout, mode: api-only` | Fase 1 → Fase 2 apenas |
| **E2E only** | `feature: checkout, mode: e2e-only` | Fase 1 → Fase 3 apenas |

## Guardrails da Pipeline

1. **Pre-flight: verificar se feature spec está disponível** — sem spec, abortar antes da Fase 1
2. **Phase 1 aborta se não conseguir gerar plano** — sem plano de teste, não há o que executar
3. **Phase 2 + 3 executam em paralelo** — são independentes entre si
4. **Ambas continuam se falharem** — não bloqueiam o output consolidado
5. **Output consolidado sempre apresentado** — mesmo se fases falharem

## Cache e Repetição

- Se Phase 1 já foi executada (mesma feature, mesmo escopo), perguntar se quer re-gerar plano ou pular
- Se Phase 2 ou 3 já foram executadas (mesma feature, mesmos endpoints/cenários), perguntar se quer re-executar ou reutilizar resultados anteriores
