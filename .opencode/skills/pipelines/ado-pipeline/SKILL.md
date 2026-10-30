---
name: ado-pipeline
description: Pipeline completa de extração de contexto Azure DevOps — preflight, parse AB#, resolve projeto, fetch work item. Compõe 4 skills atômicas ADO na ordem GOAP.
composes: [ado-preflight, ado-parse-ab, ado-resolve-project, ado-get-work-item]
---

# ADO Pipeline

## Goal

Pipeline completa para extrair contexto ADO a partir de uma referência AB# (texto, ID numérico, URL).
Compõe 4 skills atômicas ADO em sequência GOAP, consolidando o resultado em um único output estruturado.

## Ordem GOAP (organizada por fases)

| Fase | Skill | Entrada | Saída | on_failure |
|------|-------|---------|-------|------------|
| 1 | `ado-preflight` | Nenhum (sessão) | `{ mcp_enabled, connection_ok, error }` | `abort` — sem MCP não há o que fazer |
| 2 | `ado-parse-ab` | `raw: string` | `{ id, project?, format, error? }` | `continue` — erro de parse reporta sem abortar |
| 3 | `ado-resolve-project` | `projectName?` (opcional, do parse) | `{ project, team, gitFlow, ... }` | `continue` — defaultProject usado se falhar |
| 4 | `ado-get-work-item` | `{ id, project }` | `{ id, project, workItem, attempts }` | `continue` — fallback entre projetos |

### Regras de execução

1. **Fase 1 é bloqueante**: se o preflight falhar, a pipeline aborta imediatamente e reporta o erro ao usuário. Não há como continuar sem conexão MCP.
2. **Fases 2-4 são tolerantes a falhas**: cada fase reporta o erro no output consolidado mas permite que a pipeline continue, desde que haja dados suficientes para as fases seguintes.
3. **Dados fluem entre fases**: o output de cada fase é passado como input da próxima. A Fase 3 usa o `project` extraído pela Fase 2 (se disponível). A Fase 4 usa `id` da Fase 2 e `project` da Fase 3.
4. **Output consolidado**: ao final, todas as saídas são combinadas em um único objeto JSON.

## Modos de ativação

### 1. AB# curto
```
Input: "AB#19379"
→ Fase 2 (parse-ab): extrai id=19379, format=AB_HASH
→ Fase 3 (resolve-project): usa defaultProject
→ Fase 4 (get-work-item): busca WI 19379 no projeto default
```

### 2. URL completa
```
Input: "https://dev.azure.com/org/Squad%20Codefellas/_workitems/edit/19379"
→ Fase 2 (parse-ab): extrai id=19379, project="Sprint Team"
→ Fase 3 (resolve-project): confirma projeto e resolve team/gitFlow
→ Fase 4 (get-work-item): busca WI 19379 no projeto resolvido
```

### 3. Número puro
```
Input: "19379"
→ Fase 2 (parse-ab): reconhece como id numérico, format=RAW_NUMBER
→ Fase 3 (resolve-project): usa defaultProject
→ Fase 4 (get-work-item): busca WI 19379 no projeto default
```

## Output Consolidado

```json
{
  "preflight": {
    "mcp_enabled": true,
    "connection_ok": true,
    "error": null
  },
  "parsed": {
    "id": 19379,
    "raw": "AB#19379",
    "format": "AB_HASH",
    "project": null
  },
  "project": {
    "project": "Sprint Team",
    "team": "Sprint Team Team",
    "gitFlow": "trunk-based"
  },
  "workItem": {
    "id": 19379,
    "project": "Sprint Team",
    "workItem": { "...": "campos do work item" },
    "attempts": 1
  }
}
```

## Exemplo de uso completo

```
Input: "AB#19379"

→ Fase 1 (preflight): MCP OK ✅
→ Fase 2 (parse-ab): id=19379, format=AB_HASH ✅
→ Fase 3 (resolve-project): defaultProject=Sprint Team ✅
→ Fase 4 (get-work-item): WI encontrado em 1 tentativa ✅

Output consolidado:
{
  "preflight": { "mcp_enabled": true, "connection_ok": true, "error": null },
  "parsed": { "id": 19379, "raw": "AB#19379", "format": "AB_HASH" },
  "project": { "project": "Sprint Team", ... },
  "workItem": { "id": 19379, "project": "Sprint Team", "workItem": {...}, "attempts": 1 }
}
```

## Fluxo de decisão (pseudocódigo)

```
function runAdoPipeline(rawInput, projectName?) {
  // Fase 1 — Preflight (bloqueante)
  const preflight = runSkill('ado-preflight')
  if (!preflight.connection_ok) {
    return { error: 'MCP connection failed', preflight }
  }

  // Fase 2 — Parse AB# (tolerante)
  const parsed = runSkill('ado-parse-ab', { raw: rawInput })
  if (parsed.error) {
    return { preflight, parsed, error: 'Parse failed — could not extract work item ID' }
  }

  // Fase 3 — Resolve Project (tolerante)
  const project = runSkill('ado-resolve-project', { projectName: parsed.project || projectName })

  // Fase 4 — Get Work Item (tolerante, com fallback)
  const workItem = runSkill('ado-get-work-item', { id: parsed.id, project: project.project })

  // Output consolidado
  return { preflight, parsed, project, workItem }
}
```

## Tratamento de erros

| Fase | Erro | Comportamento | Mensagem ao usuário |
|------|------|---------------|---------------------|
| 1 | MCP indisponível | **Abort** | "Azure DevOps MCP não está conectado. Verifique a configuração." |
| 2 | Parse falhou | Continue (report) | "Não foi possível extrair o ID do work item a partir de: `{raw}`" |
| 3 | Projeto não resolvido | Continue (default) | "Usando projeto padrão: `{defaultProject}`" |
| 4 | Work item não encontrado | Continue (report) | "Work item #{id} não encontrado nos projetos tentados: `{projects}`" |

## Skills atômicas compostas

| Skill | Descrição |
|-------|-----------|
| `ado-preflight` | Testa conectividade MCP do Azure DevOps antes de qualquer operação ADO |
| `ado-parse-ab` | Parseia referências AB# de diferentes formatos em objeto padronizado |
| `ado-resolve-project` | Resolve projeto ADO e parâmetros git flow via ado.js resolve |
| `ado-get-work-item` | Busca work item ADO por ID com fallback entre projetos |
