# Multi-Project Architecture

> **Status:** Implantado

## Visão Geral

O workbench é uma plataforma multi-project. Os projetos são descobertos a partir
dos checkouts git no workspace e em roots configuráveis; o catálogo local é
mesclado com o catálogo base. Workbench é o projeto default.

## Modelo de Resolução

```
User Input → Identify Context (.workbench | projects/<slug> | explicit slug)
           → Read merged catalog (base + project-mapping.local.json)
           → Resolve: repos, knowledge, vault, agents, process
           → Execute: scripts, templates, agent selection
```

### Fontes

| Fonte | Uso |
|-------|-----|
| `projects/<slug>/project.json` | Metadados do projeto (nome, processo, licença, vault, agentes, repos) |
| `.opencode/config/project-mapping.json` | Catálogo base e overrides explícitos |
| `.opencode/config/project-mapping.local.json` | Catálogo local gerado por `wb projects sync`; não editar |
| `AGENTS.md` / diretório | Fallback de nome quando não há manifesto |

Em conflito, o catálogo base vence. O overlay preenche projetos e campos
ausentes.

### Disponibilidade dinâmica

`wb repo resolve` continua sendo o contrato runtime para cada repositório:

| Estado | Contrato |
|--------|----------|
| `available` | O path é diretório e possui `.git` como arquivo ou diretório. Paths nested também podem pertencer ao checkout do primeiro segmento catalogado. |
| `missing` | O path não existe. Clone somente o repo necessário e após confirmação. |
| `invalid_git` | O path existe sem checkout Git válido. Nunca sobrescrever ou clonar sobre ele; pedir decisão. |

Estados agregados: `complete`, `partial`, `absent` e `invalid`.

## Regras de Negócio

- **R1 (default):** `.workbench` é o projeto default quando nenhum projeto é explicitamente informado.
- **R2 (paridade):** Todo projeto descoberto ou catalogado é tratado igualmente pelo orquestrador.
- **R3 (resolução via catálogo mesclado):** Scripts resolvem paths via `load_project_mapping()`, que combina base e overlay local.
- **R4 (revisores — array único):** `eligible-reviewers.json` mantém estrutura de **array único `reviewers`**.
- **R5 (cross-vault permitido):** Busca em múltiplos vaults é permitida quando explicitamente solicitada.

## Scripts generalizados

| Comando | Comportamento |
|---------|---------------|
| `wb projects scan` | Descobre projetos/repos sem gravar. |
| `wb projects sync` | Gera `.opencode/config/project-mapping.local.json`. |
| `wb projects list` | Lista o catálogo mesclado. |
| `wb docs` | Lê o catálogo mesclado para resolver repositório da API. Flag `--project <slug>`. |
| `wb metrics cycle-time` | Lê o catálogo mesclado para resolver knowledge/bugs e coverage. Flag `--project`. |
| `wb knowledge search` | Vaults resolvidos via catálogo mesclado. Log estruturado. |
| `wb reviewers sort` | Lê `config.reviewers` do `eligible-reviewers.json`. |

## Onboarding de novo projeto

1. Criar `projects/<slug>/project.json` (o template está em `projects/_template/`).
2. Opcional: adicionar `AGENTS.md`, `CONVENTIONS.md`, knowledge e vault.
3. Opcional: declarar `repos` com papéis/globs se o projeto tiver múltiplos repos.
4. Rodar `wb projects sync` (o CLI, o plugin do OpenCode e o hook do Claude também atualizam automaticamente).
5. Conferir com `wb projects list` e `wb repo resolve`.

Nenhum script, template ou config central precisa ser alterado.
