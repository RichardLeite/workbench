---
description: "SDD Pipeline: spec → validação → TDD → implementação → review → vault. Um comando do início ao fim."
---

# /pipeline

> **Spec-Driven Development Pipeline.** Um único comando que orquestra toda a cadeia:
> levantamento de requisitos → spec técnica → validação da spec → testes TDD (RED) →
> implementação (GREEN) → auto-review → vault update — sem precisar encadear comandos manuais.

## Uso

```
/pipeline <descrição da funcionalidade>
/pipeline <link ou ID do Azure DevOps WI>
/pipeline
```

Se nenhum argumento for fornecido, o pipeline perguntará interativamente.

## Pipeline State (Retomada)

> **Gerenciamento de estado:** `node .opencode/scripts/pipeline.js state <create|load|resume> <slug>`
> **Validação de schema:** `node .opencode/scripts/pipeline.js validate <file>`
> **Schema do state:** `node .opencode/scripts/pipeline.js schema`

O pipeline mantém um arquivo de estado em `<knowledge>/plans/pipeline-state-<slug>.json`.

1. **Ao iniciar:** `node pipeline.js state resume <slug>` → verifica se existe estado anterior
   - Se `exists && state.status === "in_progress"` → perguntar se deseja retomar
   - Se retomar → pular fases já concluídas
   - Se começar do zero → apagar state
2. **Após cada fase:** `node pipeline.js state create <slug> <descricao>` ou atualizar state manualmente
3. **Ao abortar:** salvar state com `status: "in_progress"` + fase atual
4. **Ao concluir:** salvar state com `status: "completed"`

> State é efêmero — diretório `plans/` está no `.gitignore`.

---

## Fase 0 — Descoberta (Opcional)

Ative quando a feature for **complexa** (>8 SP), **cross-cutting** (3+ camadas) ou quando o desenvolvedor não conhece o código.

```javascript
task({
  subagent_type: "explorador",
  prompt: `Mapear código existente relacionado a: "${descricao}"
    Procurar por: endpoints, controllers, services, models, tabelas, telas, fluxos similares
    Retornar JSON: { tipo: "resultado", arquivos: [...], resposta: "..." }`
})
```

---

## Visão Geral do Fluxo

```
/pipeline <descrição>

├── FASE 0 — Descoberta (opcional): explorador
├── FASE 1 — Especificação: business-analyst → tech-architect
├── FASE 2 — Validação (Gate): tech-lead + qa-engineer (paralelo)
├── FASE 3 — Execução TDD: agentes por camada (paralelo quando possível)
└── FASE 4 — Finalização: vault-updater → git flow
```

---

## Fluxo Completo

### FASE 1 — Especificação

#### 1.1 Entrada

| Entrada | Ação |
|---------|------|
| Texto descritivo | Usar como descrição inicial |
| `AB#<id>` ou URL ADO | `node .opencode/scripts/ado.js resolve --url "<url>"` → extrai projeto; depois `ado.js resolve --project "<projeto>"` → git flow params |
| Nenhum | Perguntar |

Se entrada for insuficiente, entreviste via **business-analyst**:

```javascript
task({
  subagent_type: "business-analyst",
  prompt: `Conduza a entrevista task-refiner para: "${descricao}". Se houver AB#<id>, extraia task_id.`
})
```

#### 1.2 Feature de Negócio

```javascript
const analise = await task({
  subagent_type: "business-analyst",
  prompt: `Analise requisitos e retorne: { titulo, descricao, criterios_aceite, stakeholders, riscos, notas_tecnicas }`
})
// Persistir: write({ filePath: `${knowledge}/backlog/features/${slug}.md`, content: ... })
// Ou usar: node .opencode/scripts/pipeline.js feature-gen '<json>' > feature.md
```

#### 1.3 Spec Técnica

```javascript
task({
  subagent_type: "tech-architect",
  prompt: `Crie spec técnica modular usando template .opencode/templates/spec-template.md
    Feature: <path>
    Ordem fixa: Migrations → Models → Repository → Services → Controller+Routes → Frontend Rotas → Formulário → Modais
    (pular camadas não afetadas)
    Salvar em: <spec_path>/spec-<slug>.md
    Retornar: { path, modulos: [{nome, camada, dependencias}] }`
})
```

#### 1.4 Validar Artefatos

- [ ] Feature salva em `<feature_path>/<slug>.md`
- [ ] Spec salva em `<spec_path>/spec-<slug>.md`
- [ ] Módulos seguem ordem fixa com GIVEN/WHEN/THEN

---

### FASE 2 — Validação da Spec (Gate) ⭐

> **Etapa core do SDD.** Duas revisões independentes em paralelo.

```javascript
// 🔀 Paralelo
task({
  subagent_type: "tech-lead",
  prompt: `Revise spec: viabilidade, arquitetura, completude, riscos, dependências.
    Retorno: { status: "approved|needs_changes|blocked", problemas: [{severidade, item, sugestao}] }`
})
task({
  subagent_type: "qa-engineer",
  prompt: `Revise testabilidade: cada SHALL é testável? Edge cases? Cenários GIVEN/WHEN/THEN?
    Retorno: { estrategia, cobertura_estimada, casos: [{id, titulo, passos, resultado_esperado}] }`
})
```

**Decisão:** `node .opencode/scripts/pipeline.js gate-eval <tl-status> <qa-ok>` → avalia matriz:
- `approved` + sem bloqueios → ✅ Avança
- `needs_changes` + issues leves → ⚠️ Avança com ressalva
- `blocked` ou gate indeterminado → 🔴 **Pausa pipeline**. Máx 2 ciclos de correção.

---

### FASE 3 — Execução (TDD)

#### 3.1 Agentes por Projeto + Camada

> **Resolver agente:** `node .opencode/scripts/pipeline.js select-agent <projeto> <camada>`
> **Config das fases:** @.opencode/config/pipeline-rules.json (agentes_por_projeto)

1. Consultar `project-mapping.json#projects.<slug>.agents`
2. Se contém `Backend projeto` → usar projeto; senão → genéricos (`backend-dev`, etc.)

```javascript
// Exemplo: módulo backend no meu-projeto
task({
  subagent_type: "Backend projeto",  // node pipeline.js select-agent meu-projeto backend
  prompt: `Implementar módulo: <nome>. TDD: RED → GREEN → validar. Timeout: 30min`
})
```

**Regras:** TDD obrigatório, auto-review após implementar, limite 3 tentativas, checkpoints no state.

#### 3.2 Relatório

Use `node .opencode/scripts/pipeline.js report success <state-path>` para gerar relatório formatado.

---

### FASE 4 — Finalização

#### 4.1 Vault

Verificar `project-mapping.json#vault`. Se `null`, pular. Se projeto está no frontmatter do vault-updater, delegar:

```javascript
task({
  subagent_type: "vault-updater",
  prompt: `Atualizar vault com feature. Feature: <path>. Spec: <path>.`
})
```

#### 4.2 Git Flow

| Origem | Fluxo |
|--------|-------|
| `pipeline-state.ado_project` resolvido | Sprint → `/git-sprint` / Hotfix → `/git-hotfix` |
| `.workbench` (sem ADO) | Sprint (base `main`, sem `TASK-`) |
| Sem ADO | **Perguntar** sprint ou hotfix |

> Os comandos `/git-sprint` e `/git-hotfix` estão em `.opencode/commands/`. O orquestrador deve seguir o comando escolhido passo a passo.

#### 4.3 Relatório Final

> **Relatório de sucesso:** `node .opencode/scripts/pipeline.js report success <state-path>`
> **Relatório parcial:** `node .opencode/scripts/pipeline.js report partial <state-path> <motivo> <fase>`

---

## Regras

1. **Auto-deteção primeiro** — detecte se é texto ou Azure WI antes de perguntar
2. **Spec validation gate obrigatório** — Fase 2 sempre executa, sem exceção
3. **Gate pausa em issues GRAVES** — `blocked` interrompe; `needs_changes` segue com ressalva
4. **Re-validação máx 2 ciclos** — se após 2 tentativas o gate ainda reprovar, perguntar se quer abandonar
5. **Agentes diretos** — cada módulo delegado ao agente especializado, sem execute-spec-runner
6. **vault-updater sempre no final** — knowledge base só atualizada após implementação
7. **Kill-switch** — a qualquer momento "abortar" ou "parar" salva checkpoint e encerra
8. **Delegação via `task()`** — blocos `Delegar @agent:` sem `task()` são ignorados
9. **Pipeline state obrigatório** — salvar após cada fase. Verificar retomada ao iniciar
10. **Timeouts** — @.opencode/config/pipeline-rules.json (fases[].timeout_min)
11. **Limite de módulos** — >6 módulos = lotes de até 6. @.opencode/config/pipeline-rules.json (limites)
12. **Resolução de paths** — consulte `project-mapping.json` para `<knowledge>`, `<vault>` etc.
13. **Git flow routing** — `node .opencode/scripts/ado.js resolve --project "<project>"` → comando git
