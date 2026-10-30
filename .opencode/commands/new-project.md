---
description: "Scaffolding de novo projeto: cria estrutura em projects/<name>/ e registra no catálogo"
---

# /new-project

> Cria a estrutura completa de um novo projeto no workbench, incluindo diretórios,
> template AGENTS.md, knowledge base, e registro no catálogo central.

## Uso

```
/new-project
```

O comando é **interativo** — faz as perguntas necessárias.

## Fluxo

### FASE 1 — Coletar informações

Pergunte ao usuário:

| Pergunta | Campo | Exemplo |
|----------|-------|---------|
| Qual o nome do projeto? | `name` | "CarFlow API" |
| Qual o slug (identificador curto)? | `slug` | `outro-projeto` |
| Quais repositórios existem? | `repos` | api, app, jobs |
| Stack do backend? | `backend_stack` | Node.js + Express + MySQL |
| Stack do frontend? | `frontend_stack` | React 18 + Vite (ou N/A) |
| Comandos de dev? | `dev_commands` | `yarn dev`, `yarn test` |
| Convenções importantes? | `conventions` | Conventional commits, etc |

### FASE 2 — Criar estrutura

Copie o template de `projects/_template/` para `projects/<slug>/`:

```
projects/<slug>/
├── AGENTS.md
├── agents/
├── knowledge/
│   ├── backlog/
│   │   ├── features/
│   │   └── bugs/
│   ├── specs/
│   └── decisions/
└── README.md
```

### FASE 3 — Preencher AGENTS.md

Use o template `projects/_template/AGENTS.md` e substitua os placeholders
`{{placeholders}}` pelos dados coletados na Fase 1.

### FASE 4 — Registrar no catálogo

Adicione o projeto ao `.opencode/config/project-mapping.json`:

```json
{
  "projects": {
    "<slug>": {
      "name": "<name>",
      "repos": { ... },
      "knowledge": "projects/<slug>/knowledge",
      "agents": ["pedreiro"]
    }
  }
}
```

### FASE 5 — Registrar no opencode.json (references)

Adicione as referências para cada repositório do projeto:

```json
"reference": {
  "<slug>-api": { "path": "<repo_api_dir>" },
  "<slug>-app": { "path": "<repo_app_dir>" }
}
```

### FASE 6 — Registrar no .gitignore (se repo clonado)

Se o repositório for clonado para a raiz do workbench, adicione ao `.gitignore`
na seção de projetos:

```
# Project repos (cloned to root)
<repo_dir>/
```

### FASE 7 — Confirmar

Mostre o resumo:

```
╔══════════════════════════════════════════════╗
║  Projeto criado com sucesso!                ║
╠══════════════════════════════════════════════╣
║                                              ║
║  Nome:     <name>                            ║
║  Slug:     <slug>                            ║
║  Path:     projects/<slug>/                  ║
║  Repos:    <repos>                           ║
║                                              ║
║  Próximos passos:                            ║
║  └── Criar agentes em projects/<slug>/agents/║
║                                              ║
╚══════════════════════════════════════════════╝
```

## Regras

1. **Interativo** — sempre pergunte antes de criar
2. **Template primeiro** — use `projects/_template/` como base, nunca crie do zero
3. **Registro obrigatório** — todo projeto DEVE ser registrado no `project-mapping.json`
4. **Placeholders** — todo `{{placeholder}}` no AGENTS.md DEVE ser substituído
