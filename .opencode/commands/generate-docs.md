---
description: "Automação de documentação: README, docs de API, arquivos de conhecimento."
---

# /generate-docs

> **Automação de documentação.** Gera ou atualiza README, documentação de API
> e arquivos de conhecimento do vault — a partir do código fonte e histórico de commits.

## Uso

```
/generate-docs readme              # README.md do projeto
/generate-docs api                 # Documentação de API (endpoints)
/generate-docs vault               # Atualiza vault com entidades/endpoints
/generate-docs all                 # Todos os tipos
/generate-docs readme <caminho>    # README de um diretório específico
```

## Tipos de Documentação

### 1. README

Gera/atualiza `README.md` com base na estrutura do projeto:

```
📄 README.md — <project-name>
├── Badges: build, coverage, license
├── Descrição: o que o projeto faz
├── Stack: tecnologias principais
├── Setup: pré-requisitos, instalação, variáveis de ambiente
├── Desenvolvimento: scripts, testes, conventions
├── Estrutura: diretórios principais com descrição
└── Links: wiki, backlog, ADRs
```

**Fontes:** `package.json`, estrutura de diretórios, `CONVENTIONS.md`, `AGENTS.md`

### 2. API Docs

Gera documentação de endpoints REST:

```
📄 API.md — Endpoints
├── Customers
│   ├── GET    /api/v2/customers       — Listar (paginado, filtros)
│   ├── GET    /api/v2/customers/:id   — Buscar por ID
│   ├── POST   /api/v2/customers       — Criar
│   ├── PUT    /api/v2/customers/:id   — Atualizar
│   └── DELETE /api/v2/customers/:id   — Excluir
├── Sales
│   └── ...
└── Products
    └── ...
```

**Fontes:** Rotas do Express (arquivos de rota), controllers, swagger docs

### 3. Vault Update

Atualiza o Obsidian vault com novas entidades, endpoints e regras de negócio
(igual ao `@vault-updater`, mas via comando explícito).

## Como Funciona

Cada tipo de documento tem um **scanner** que extrai informações do código:

| Tipo | Scanner | Extrai |
|------|---------|--------|
| README | `package.json` + `ls` | Nome, scripts, estrutura |
| API | `route files` + `controllers` | Endpoints, métodos, params |
| Vault | `entities/*.js` + `routes/*.js` | Entidades, regras, relacionamentos |

## Exemplos

```
/generate-docs readme
/generate-docs api meu-projeto-api/src/routes
/generate-docs vault
/generate-docs all
```

## Regras

1. **Nunca sobrescrever documentação manual** — apenas gerar/adicionar seções não existirem ou se o usuário autorizar
2. **API docs seguem CONVENTIONS.md** — `snake_case` URLs, `camelCase` JSON bodies
3. **Vault update classifica mudança** — usar árvore de decisão do `vault-updater.md`
4. **Sempre mostrar diff antes de escrever** — perguntar "Deseja salvar estas alterações?"
