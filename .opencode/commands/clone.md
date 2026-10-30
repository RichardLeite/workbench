---
description: "Clona um repositório da organização configurada e atualiza a descoberta automática"
---

# /clone

> Clona um repositório da organização configurada em `GITHUB_OWNER` após validar
> sua disponibilidade dinâmica.

## Uso

```
/clone meu-projeto-api
/clone @meu-projeto-app
```

Aceita com ou sem `@` na frente.

## Fluxo

### FASE 1 — Validar

1. Extraia o nome do repositório do argumento.
2. Procure um checkout local com esse nome antes de clonar.
3. Se o repositório pertencer a um projeto catalogado, execute:
   `uv run --frozen python -m workbench repo resolve --project <slug> --repo <role>`
4. Respeite o estado retornado:
   - `available`: use o checkout existente; não clone
   - `missing`: peça confirmação explícita antes de clonar somente esse repo
   - `invalid_git`: bloqueie o clone/sobrescrita e peça uma decisão sobre o path

### FASE 2 — Clonar

```bash
gh repo clone ${GITHUB_OWNER}/<repo>
```

Clone na raiz do workbench ou em `discovery.roots`.

### FASE 3 — Descobrir

```bash
uv run --frozen python -m workbench projects sync
uv run --frozen python -m workbench projects list
```

Se o repositório não aparecer ou precisar de um papel específico, crie/edite
`projects/<slug>/project.json` com `repos`:

```json
{ "repos": { "api": "meu-projeto-api" } }
```

Não edite `opencode.json#reference` nem o `project-mapping.json` central.

### FASE 4 — Validar disponibilidade

Execute novamente `wb repo resolve --project <slug> --repo <role>` e exija
estado `available` quando o projeto tiver papéis declarados.

### FASE 5 — Resumo

Mostre repositório, projeto, path, catálogo atualizado e disponibilidade.
Sugira `/new-project` se o projeto ainda não tiver metadados.

## Regras

1. **Sempre pergunte antes de clonar**.
2. **Resolva antes e depois** — use `wb repo resolve` como fonte de disponibilidade.
3. **Nunca sobrescreva `invalid_git`**.
4. **Sem registro manual** — use `wb projects sync` e `projects/<slug>/project.json`.
