---
name: pr
description: Cria Pull Requests no GitHub usando MCP First e gh CLI fallback, com template centralizado em pr-config.md.
---

## Goal

Criar Pull Requests com evidencias objetivas, seguindo a estrategia MCP First / gh CLI Fallback.

> **⚠️ REGRA OBRIGATÓRIA:** Todo PR body DEVE seguir o template da Seção 3 de `.opencode/config/pr-config.md`.
> Não duplicar template aqui — consultar o config central.

## Parameters (contexto)

A skill recebe do comando/agente chamador:

- `base`: branch alvo do PR (`release`, `main`)
- `head`: branch de origem (ex: `feat/TASK-1234`)
- `task`: numero da task (ex: `TASK-1234`) — opcional
- `type`: `sprint` ou `hotfix`
- `context`: `.workbench` ou `meu-projeto`
- `stage`: `main` ou `release` (apenas para hotfix — identifica se e PR1 ou PR2)

---

## Procedure

### STEP 1: Verificar disponibilidade do GitHub MCP

Sempre que precisar criar PR, primeiro verificar:

```bash
which gh && gh auth status
```

**Regra:**

- Se ferramentas GitHub MCP estiverem disponiveis → usar MCP como metodo primario
- Se MCP nao estiver disponivel ou falhar → usar `gh` CLI como fallback
- Esta verificacao e feita uma vez no inicio e o resultado vale para toda a sessao

### STEP 2: Validar ausência de console.log

Antes de coletar contexto, verificar se há `console.log` no diff:

```bash
git diff {{BASE}}..{{HEAD}} --name-only | ForEach-Object { $file = $_; $file = $file.Trim(); if (Test-Path -LiteralPath $file) { Select-String -Path $file -Pattern "console\.log" -SimpleMatch -Quiet } } | Where-Object { $_ }
```

> **Regra:** Se o comando retornar qualquer arquivo com `console.log`, o PR **NÃO pode ser criado**.
> Deve-se remover todos os `console.log` antes de prosseguir.
>
> **Aceitável (apenas estes cenários):**
> - `logger.middleware.ts` — middleware específico de logging de requisições
> - `*.test.*` — arquivos de teste (debug durante desenvolvimento)
> - `console.error` em `catch` blocks com `throw` em seguida — apenas se o erro for relançado após o log
>
> **Nunca aceitável:**
> - `console.log` de debug (`[DEBUG]`, `[LOG]`) em produção
> - `console.log` em arquivos de controller, service, repository (fora de teste/logger)
> - Comentários com `// console.log` esquecidos

Se houver `console.log`, listar os arquivos e falhar com erro.

### STEP 3: Coletar contexto

Antes de criar o PR, coletar:

1. Commits que serao incluidos:

```bash
git log {{BASE}}..{{HEAD}} --oneline
```

2. Arquivos alterados:

```bash
git diff {{BASE}}..{{HEAD}} --stat
```

3. Resumo das alteracoes

### STEP 4: Montar o PR

#### Titulo

Consultar **Seção 2 (PR TITLE FORMAT)** de `.opencode/config/pr-config.md`.

| Contexto         | Formato (do pr-config.md)           |
| ---------------- | ----------------------------------- |
| SPRINT           | `[TASK-XXXX] Descrição em inglês`  |
| HOTFIX → main    | `[TASK-XXXX] Descrição em inglês`  |
| HOTFIX → release | `[TASK-XXXX] Hotfix - Descrição`   |
| .workbench       | `tipo(workbench): descricao`       |

#### Corpo do PR

**SEMPRE em PORTUGUES.** Usar o template da **Seção 3 (PR BODY TEMPLATE)** de `.opencode/config/pr-config.md`.

O template central contém:
- O que mudou?
- Por quê?
- Evidências (testes + execução)
- Possíveis riscos
- Rollback
- Commits
- Checklist

### STEP 4: Criar PR

#### Via GitHub MCP (preferencial)

Usar ferramentas `github_*` do MCP para criar o PR com titulo, corpo e base.

#### Via gh CLI (fallback)

```bash
gh pr create \
  --title "[{{TASK}}] {{TITLE}}" \
  --body "..." \
  --base {{BASE_BRANCH}}
```

### STEP 5: Retornar resultado

```
✅ PR criado: {{HEAD}} → {{BASE}}
📎 URL: https://github.com/{{OWNER}}/{{REPO}}/pull/{{NUMBER}}
```

---

## Guardrails

| #   | Regra                            | Acao                                        |
| --- | -------------------------------- | ------------------------------------------- |
| 1   | **Nunca aprovar ou mergear PRs** | Apenas criar, nunca aprovar/mergear         |
| 2   | **PR body em portugues**         | Descricao, motivacao, riscos em portugues   |
| 3   | **MCP First, gh CLI Fallback**   | Tentar MCP primeiro, se falhar usar gh      |
| 4   | **Nunca commitar em protected**  | PR sempre de branch para base, nunca direto |
| 5   | **Sem console.log no diff**      | Rodar STEP 2 antes de criar PR. Se falhar, remover todos os `console.log` antes de prosseguir. |

---

## Configuração Centralizada

> **Todas as regras de PR (branch naming, templates, corpo, mappings) estão em:**
> `.opencode/config/pr-config.md`

### Regras por Contexto (pr-config.md Seção 1 + Seção 11)

| Contexto          | Base      | Branch Pattern            |
| ----------------- | --------- | ------------------------- |
| `.workbench`      | `main`    | `type/description`        |
| SPRINT            | `release` | `feat/TASK-XXXX`          |
| HOTFIX → main     | `main`    | `fix/TASK-XXXX`           |
| HOTFIX → release  | `release` | `fix/TASK-XXXX-release`   |

### Título e Corpo

- **Título**: pr-config.md Seção 2
- **Corpo**: pr-config.md Seção 3 (template único obrigatório)

---

## Mapeamento de Repositorios (do pr-config.md Seção 5)

| Projeto                    | Repositorio GitHub                     |
| -------------------------- | -------------------------------------- |
| .workbench                 | (repositorio atual)                    |
| Projetos registrados       | `$GITHUB_OWNER/<repo>` via project-mapping |
| Outro                      | Perguntar owner/repo                   |
