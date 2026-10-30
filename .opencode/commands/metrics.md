---
description: "Métricas do processo: cycle time, tokens gastos, defeitos, cobertura. Visão do ecossistema."
---

# /metrics

> **Observabilidade do processo de desenvolvimento.** Exibe métricas de ciclo,
> consumo de tokens, defeitos por sprint e cobertura de testes — consolidando
> dados do Azure DevOps, git log e arquivos de checkpoint.

## Uso

```
/metrics                    # Relatório completo do sprint atual
/metrics cycle-time         # Apenas cycle time
/metrics tokens             # Apenas consumo de tokens
/metrics defects            # Apenas defeitos (P0/P1/P2)
/metrics coverage           # Apenas cobertura de testes
/metrics sprint <nome>      # Sprint específico
/metrics since <data>       # Desde uma data (YYYY-MM-DD)
```

## O que cada métrica mostra

### Cycle Time

Tempo desde o primeiro commit até o merge do PR:

```
📊 Cycle Time — Sprint Atual
├── Média:       2.3 dias
├── Mediana:     1.8 dias
├── Mín/Máx:     0.5 / 5.2 dias
├── P50:         1.8d  |  P80: 3.1d  |  P95: 4.7d
└── Total de PRs mergeados: 12
```

**Fontes:** `git log --merges`, GitHub API (PRs merged), Azure DevOps (work items)

### Token Consumption

Gastos por agente, tarefa e sprint:

```
📊 Token Consumption — Últimos 30 dias
├── Total:              1,234,567 tokens
├── Por agente:
│   ├── @revisor:       456,789 (37%)
│   ├── @Backend projeto:   345,678 (28%)
│   ├── @Frontend projeto:  234,567 (19%)
│   ├── @explorador:    123,456 (10%)
│   └── Outros:          74,077 (6%)
├── Por tarefa:
│   ├── Média:           12,345 tokens/tarefa
│   ├── Mais cara:       AB#1234 — 45,678 tokens (@revisor)
│   └── Mais barata:     AB#5678 — 2,345 tokens (@explorador)
└── Custo estimado:     ~$6.17 USD (5M tokens = ~$25)
```

**Fontes:** Logs de execução dos agentes (checkpoints, históricos de subagent)

### Defects

Bug tracker consolidado:

```
📊 Defects — Sprint Atual
├── Abertos:        5 (P0:1  P1:3  P2:1)
├── Fechados:       8 (P0:2  P1:4  P2:2)
├── Taxa de fuga:   12% (bugs que passaram pelo review)
├── MTTR (P0):      4.2 horas
├── MTTR (P1):      1.3 dias
└── Por origem:
    ├── Backend:    4
    ├── Frontend:   3
    ├── Banco:      1
    └── Integração: 2
```

**Fontes:** Azure DevOps (bugs), GitHub Issues, `projects/*/knowledge/backlog/bugs/`

### Test Coverage

Evolução da cobertura ao longo do tempo:

```
📊 Test Coverage — Evolução (últimos 3 sprints)
├── Backend (meu-projeto-api):
│   ├── Sprint N-2:  42% │██████████████████░░░░░░░░░░░░░░│
│   ├── Sprint N-1:  48% │██████████████████░░░░░░░░░░░░░░│
│   └── Sprint Atual: 55% │██████████████████████░░░░░░░░░░│
├── Frontend (meu-projeto-app):
│   ├── Sprint N-2:  18% │██████░░░░░░░░░░░░░░░░░░░░░░░░░░│
│   ├── Sprint N-1:  22% │███████░░░░░░░░░░░░░░░░░░░░░░░░░│
│   └── Sprint Atual: 25% │████████░░░░░░░░░░░░░░░░░░░░░░░░│
└── Meta: Backend 70%, Frontend 50%
```

**Fontes:** `yarn test --coverage` nos projetos, `lcov.info`, histórico de checkpoints

## Como os dados são coletados

| Métrica | Coleta | Frequência |
|---------|--------|------------|
| Cycle Time | GitHub API (PRs) + `git log` | On demand |
| Token Consumption | Logs de execução dos agentes | Por tarefa |
| Defects | Azure DevOps WIQL query | On demand |
| Coverage | `lcov.info` files | Por sprint |

## Script de coleta

```bash
# Coletar todas as métricas do sprint atual
uv run --frozen python -m workbench metrics cycle-time

# Output: JSON com todas as métricas
```

## Regras

1. **Dados aproximados** — métricas são estimativas baseadas em fontes disponíveis; nunca bloquear decisões em dados imprecisos
2. **Sem banco de métricas** — não persiste histórico (por enquanto); cada execução consulta as fontes ao vivo
3. **Azure DevOps necessário** — cycle time e defects dependem de acesso ao Azure DevOps
4. **GitHub token** — para consultar PRs via API, `gh` CLI deve estar autenticado
5. **Cobertura sob demanda** — executa `yarn test --coverage` se solicitado explicitamente
