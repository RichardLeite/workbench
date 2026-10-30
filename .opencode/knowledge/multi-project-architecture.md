# Multi-Project Architecture

> **Status:** Implantado

## Visão Geral

O workbench é uma plataforma genuinamente multi-project. Todos os projetos
catalogados em `project-mapping.json` são tratados com paridade pelo
orquestrador, scripts e templates.

**Workbench é o projeto default** — toda chamada sem contexto explícito assume
`.workbench`. Não há branches especiais por slug em código de produção.

## Modelo de Resolução

```
User Input → Identify Context (.workbench | projects/<slug> | explicit slug)
           → Read project-mapping.json#projects.<slug>
           → Resolve: repos, knowledge, vault, agents
           → Execute: scripts, templates, agent selection
```

### Fonte da Verdade

`.opencode/config/project-mapping.json` é a única fonte da verdade para:

| Campo | Uso |
|-------|-----|
| `repos` | Paths dos repositórios (api, app, etc.) |
| `knowledge` | Diretório de conhecimento do projeto |
| `vault` | Diretório do vault Obsidian |
| `agents` | Agentes compatíveis com o projeto |

### Disponibilidade dinâmica de repositórios

`project-mapping.json#repos` cataloga paths relativos à raiz do workbench, mas
não armazena disponibilidade por máquina. O contrato runtime está em
`wb repo resolve` (`src/workbench/commands/repo.py`):

| Estado do repo | Contrato |
|----------------|----------|
| `available` | O path é diretório e possui `.git` como arquivo ou diretório. Paths nested também podem pertencer ao checkout do primeiro segmento catalogado. |
| `missing` | O path não existe. Clone somente o repo necessário e após confirmação. |
| `invalid_git` | O path existe sem checkout Git válido. Nunca sobrescrever ou clonar sobre ele; pedir decisão. |

Estados agregados: `complete` quando todos estão disponíveis, `partial` quando
há ao menos um disponível e outro indisponível, `absent` quando todos estão
ausentes e `invalid` quando nenhum está disponível e ao menos um é `invalid_git`.

## Regras de Negócio

- **R1 (default):** `.workbench` é o projeto default quando nenhum projeto é explicitamente informado.
- **R2 (paridade):** Todo projeto registrado em `project-mapping.json` é tratado igualmente pelo orquestrador.
- **R3 (resolução via mapping):** Scripts resolvem paths exclusivamente via `project-mapping.json`.
- **R4 (revisores — array único):** `eligible-reviewers.json` mantém estrutura de **array único `reviewers`**.
- **R5 (cross-vault permitido):** Busca em múltiplos vaults é permitida quando explicitamente solicitada.

## Scripts generalizados

| Comando | Comportamento |
|---------|---------------|
| `wb docs` | Lê `project-mapping.json` para resolver repositório da API. Flag `--project <slug>`. |
| `wb metrics cycle-time` | Lê `project-mapping.json` para resolver knowledge/bugs e coverage paths. Flag `--project`. |
| `wb knowledge search` | Vaults resolvidos via mapping. Log estruturado. |
| `wb reviewers sort` | Lê `config.reviewers` do `eligible-reviewers.json`. |

## Onboarding de novo projeto

1. Editar `project-mapping.json`: adicionar entrada em `projects.<slug>`
2. Opcional: adicionar revisores em `eligible-reviewers.json#reviewers`
3. Opcional: criar `projects/<slug>/CONVENTIONS.md`
4. Opcional: criar `projects/<slug>/AGENTS.md`

Nenhum script, template ou config precisa ser alterado.
