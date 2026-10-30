---
description: "Dispatcher de refinamento: FASE 1 source → FASE 2 entrevista (task-refiner) → FASE 3 roteia p/ new-bug|new-feature|new-adr → FASE 4 vault-updater → FASE 5 resultado."
---

# /refinar

Dispatcher: entrevista via skill `task-refiner`, geração delegada aos comandos especializados.

## Quando usar

- `/refinar <numero>` → WI do Azure
- `/refinar <path>` → spec existente
- `/refinar <texto>` → descrição avulsa
- `/refinar` → pergunta
- "preciso refinar essa task" → contexto atual

## Fluxo

### FASE 1 — Source

Analisar `$ARGUMENTS`:

- **Número** → resolva o projeto Azure DevOps: @.opencode/skills/ado-resolve-project, depois:
  1. @.opencode/skills/ado-get-work-item — tente `defaultProject` primeiro; se falhar (404/erro), tente o próximo projeto da lista
  2. Extraia `title + description` do work item e salve `System.TeamProject` para uso posterior
- **Link (URL do Azure DevOps)** → @.opencode/skills/ado-resolve-project (use `--url "<url>"`) → depois @.opencode/skills/ado-get-work-item para obter title+description
- **Path** → `read` tool → extrai conteúdo
- **Texto** → usar direto
- **Vazio** → perguntar

### FASE 2 — Entrevista (skill task-refiner)

Carregar `@.opencode/skills/task-refiner` com `{ source_type, source_title, source_description, source_id }`.

Retorna JSON com:
- `detected_artifact.type` (`bug|feature|adr|plan|spec|custom`)
- `detected_artifact.command_target` (`/new-bug|/new-feature-spec|/new-adr|null`)
- `interview` (respostas nomeadas)
- `tech_findings` (descobertas do codebase)

Salvar como `$INTERVIEW_DATA`.

### FASE 3 — Roteamento

Os templates foram atualizados para o **formato modular** com TDD + auto-review.
Consulte as instruções em cada comando para detalhes.

| Tipo | Ação |
|------|------|
| `bug` | Fluxo `/new-bug`: template `bug-template.md` → salva em `backlog/bugs/<WI-ID>-<slug>.md` ou `.opencode/knowledge/bugs/<slug>.md` |
| `feature` | Fluxo `/new-feature-spec`: template `feature-template.md` (negócio) → salva em `backlog/features/<slug>.md` ou `.opencode/knowledge/features/<slug>.md` |
| `adr` | Fluxo `/new-adr`: template `adr-template.md` → salva em `adr/ADR-XXX-<slug>.md` |
| `plan` | Template de plano próprio → salva em `plans/<slug>.md` |
| `spec` | Template `spec-template.md` (executável, modular) → salva em `specs/<slug>.md` |
| `custom` | Perguntar formato ao usuário |

**Mapeamento interview → template:**

- bug: `environment→Ambiente, repro_steps→Reprodução (Cenário GIVEN/WHEN/THEN), expected_vs_actual→Descrição (esperado + atual), evidence→Evidências, extra_notes→Solução + Causa Raiz, severity→Descrição, tech_findings→Notas Técnicas`
- feature: `objective→Problema, stakeholder+impact→Valor para o Negócio, scope_in_out+business_rules→Requisitos Funcionais, acceptance_criteria→Critérios de Aceite, extra_notes→Notas, tech_findings→Notas (opcional)`
- adr: `decision_problem→Contexto, options→Opções, recommendation→Decisão, trade_offs→Trade-offs, validation_plan→Validação`
- plan: `objective→Objetivo, layers→Divisão (cada camada vira um módulo), execution_order→Ordem, risks_blindspots→Riscos, rollback_strategy→Rollback`

Incluir `tech_findings` como nota adicional em todos os tipos.

#### Template de plano (para type=plan)

```markdown
# Plano: <titulo>
## TASK
## Objetivo
{objective}
## Divisão
| # | Tarefa | Camada | Módulo | Estimativa | Depende de |
| - | ----- | ------ | ------ | ---------- | ---------- |
## Ordem sugerida
{execution_order}
## Riscos
{risks_blindspots}
## Rollback
{rollback_strategy}
## Validação
{extra_notes}
```

### FASE 4 — Vault-updater

Disparar `@vault-updater` se aplicável:

| Tipo | Vault? |
|------|--------|
| bug | Sim (se RULE_CHANGE) |
| feature | Sim (sempre) |
| adr | Não |
| plan | Não |
| spec | Perguntar |
| custom | Perguntar |

Fluxo: ler `.opencode/agents/vault-updater.md` → árvore de decisão → aplicar se relevante.

### FASE 5 — Resultado

```
Refinamento concluido.
Artefato: <tipo> — <titulo>
Salvo em: <caminho>
Vault: <atualizado | sem alteracoes | n/a>
```

## Design

```
/refinar → source → task-refiner → roteamento
                                    ├── bug     → /new-bug     → salva → vault
                                    ├── feature → /new-feature → salva → vault
                                    ├── adr     → /new-adr     → salva
                                    ├── plan    → direto       → salva
                                    ├── spec    → direto       → salva
                                    └── custom  → perguntar    → salva
```

Comandos especializados continuam funcionando standalone. `/refinar` só adiciona a camada de entrevista.
