---
description: "Clona um repositório da organização configurada e registra automaticamente no workbench"
---

# /clone

> Clona um repositório da organização configurada em `GITHUB_OWNER` após validar
> sua disponibilidade dinâmica e o registra nas configurações necessárias.

## Uso

```
/clone meu-projeto-api
/clone @meu-projeto-app
```

Aceita com ou sem `@` na frente.

## Fluxo

### FASE 1 — Validar

1. Extraia o nome do repositório do argumento (remova `@` se presente)
2. Verifique no `project-mapping.json` se o repo está catalogado
3. Se não estiver catalogado → pergunte: "Qual projeto este repo pertence?"
4. Execute `uv run --frozen python -m workbench repo resolve --project <slug> --repo <role>`
5. Respeite o estado retornado:
   - `available`: use o checkout existente; não clone
   - `missing`: peça confirmação explícita antes de clonar somente esse repo
   - `invalid_git`: bloqueie o clone/sobrescrita e peça ao usuário uma decisão sobre o path existente

### FASE 2 — Clonar

```bash
gh repo clone ${GITHUB_OWNER}/<repo>
```

Isso clona dentro do diretório atual (workbench root).

### FASE 3 — Configurar

#### 3.1 .gitignore

Adicione `repo/` na seção `# Project repos (cloned to root)` do `.gitignore`,
em ordem alfabética.

#### 3.2 opencode.json (references)

Adicione a referência:

```json
"<repo>": { "path": "<repo>" }
```

Mantenha a lista em ordem alfabética.

#### 3.3 project-mapping.json

Se o repo não estava catalogado:
1. Pergunte: nome do projeto, descrição, slug, outros repos do mesmo projeto
2. Crie a entrada no `project-mapping.json`
3. Crie `projects/<slug>/` com a estrutura do template

#### 3.4 Validar disponibilidade

Execute novamente `uv run --frozen python -m workbench repo resolve --project <slug> --repo <role>` e exija estado `available`.

### FASE 4 — Resumo

```
╔══════════════════════════════════════════════╗
║  Repositório clonado com sucesso!           ║
╠══════════════════════════════════════════════╣
║                                              ║
║  Repo:     <repo>                            ║
║  Projeto:  <project>                         ║
║  Path:     <workbench-root>/<repo>/            ║
║                                              ║
║  Configurado:                                ║
║  ├── .gitignore                              ║
║  ├── opencode.json                           ║
║  └── disponibilidade: available              ║
║                                              ║
║  Próximos passos:                            ║
║  ├── /new-project (se projeto novo)          ║
║  └── /mcp-start <projeto> (se tiver DB)      ║
║                                              ║
╚══════════════════════════════════════════════╝
```

## Regras

1. **Sempre pergunte antes de clonar** — confirme com o usuário
2. **Resolva antes e depois** — use `wb repo resolve` como fonte runtime de disponibilidade
3. **Nunca sobrescreva `invalid_git`** — interrompa e peça uma decisão
4. **Se não catalogado** — trate como novo projeto e sugira `/new-project`
