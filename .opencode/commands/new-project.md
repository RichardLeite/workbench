---
description: "Scaffolding de novo projeto: cria estrutura em projects/<name>/ e deixa a descoberta automática resolver os repos"
---

# /new-project

> Cria a estrutura completa de um novo projeto no workbench, incluindo
> `AGENTS.md`, `project.json`, knowledge base e agentes opcionais.

## Uso

```
/new-project
```

O comando é **interativo** — faz as perguntas necessárias.

## Fluxo

### FASE 1 — Coletar informações

| Pergunta | Campo | Exemplo |
|----------|-------|---------|
| Qual o nome do projeto? | `name` | "CarFlow API" |
| Qual o slug (identificador curto)? | `slug` | `carflow` |
| Qual o processo? | `process` | `default` |
| Qual a licença? | `license` | `MIT`, `Apache-2.0`, `proprietary` |
| Stack do backend? | `backend_stack` | Node.js + Express + MySQL |
| Stack do frontend? | `frontend_stack` | React 18 + Vite (ou N/A) |
| Comandos de dev? | `dev_commands` | `yarn dev`, `yarn test` |
| Convenções importantes? | `conventions` | Conventional commits, etc |

Não pergunte caminhos de repositório: a descoberta encontra os checkouts git
na raiz do workspace e em `discovery.roots`/`WB_PROJECT_ROOTS`.

### FASE 2 — Criar estrutura

Copie o template de `projects/_template/` para `projects/<slug>/`:

```
projects/<slug>/
├── AGENTS.md
├── project.json
├── agents/
├── knowledge/
│   ├── backlog/
│   │   ├── features/
│   │   └── bugs/
│   ├── specs/
│   └── decisions/
└── README.md
```

### FASE 3 — Preencher metadados

Substitua os placeholders de `project.json`:

```json
{
  "slug": "<slug>",
  "name": "<name>",
  "description": "<description>",
  "process": "<process>",
  "license": "<license>",
  "tracker": "none",
  "agents": [],
  "knowledge": "projects/<slug>/knowledge",
  "vault": null,
  "repos": {}
}
```

Para múltiplos repositórios, preencha `repos` com os papéis e nomes/globs dos
diretórios. Para um único repositório, deixe `repos` vazio e use o slug igual ao
nome do diretório.

Use o template `projects/_template/AGENTS.md` e substitua os placeholders
`{{placeholders}}` pelos dados coletados na Fase 1.

### FASE 4 — Atualizar o catálogo

```bash
uv run --frozen python -m workbench projects scan
uv run --frozen python -m workbench projects sync
```

Não edite `.opencode/config/project-mapping.json` nem `opencode.json#reference`:
o catálogo local é gerado em `.opencode/config/project-mapping.local.json` e os
aliases `@` são injetados pelo plugin do OpenCode.

### FASE 5 — Confirmar

Mostre o resumo com nome, slug, processo, licença e repositórios descobertos.
Se algum repositório não foi encontrado, oriente a cloná-lo no root ou em
`discovery.roots` e rode `wb projects sync` novamente.

## Regras

1. **Interativo** — sempre pergunte antes de criar.
2. **Template primeiro** — use `projects/_template/` como base.
3. **Sem registro manual** — a descoberta é a fonte dos nomes e caminhos.
4. **Placeholders** — todo `{{placeholder}}` deve ser substituído.
