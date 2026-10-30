---
name: commit
description: Executa o fluxo de commit: verificar modificacoes, agrupar por feature, apresentar para aprovacao, commitar e fazer push.
---

## Goal

Executar o fluxo de commit com seguranca: verificar arquivos modificados, agrupar por feature, apresentar para aprovacao humana, commitar e fazer push.

## Parameters (contexto)

A skill recebe do comando/agente chamador:

- `task`: numero da task (ex: `TASK-1234`) — opcional para `.workbench`
- `branch`: nome da branch atual
- `type`: tipo de commit padrao (`feat`, `fix`, `chore`, etc.)
- `context`: `.workbench` ou `meu-projeto`

---

## Procedure

### STEP 1: Verificar arquivos modificados

```bash
git status
git diff --name-only
```

### STEP 2: Agrupar arquivos por feature

Analisar os arquivos modificados e agrupar por funcionalidade. Cada feature vira **um commit separado**.

### STEP 3: LISTAR COMMITS PREVISTOS NO CHAT

Antes de criar a `question`, **listar os commits previstos em uma mensagem de texto no chat** para que o usuario possa ver os detalhes completos.

Formato da listagem:

```
📋 Commit 1 — {{TYPE}}(AB#{{TASK}}): {{MESSAGE}}
   Arquivos:
   - path/do/arquivo1.js
   - path/do/arquivo2.js

📋 Commit 2 — {{TYPE}}(AB#{{TASK}}): {{MESSAGE}}
   Arquivos:
   - path/do/arquivo3.js
```

Cada commit deve mostrar: tipo, mensagem e lista de arquivos envolvidos.

### STEP 4: APRESENTAR COMMITS PARA APROVACAO VIA TOOL QUESTION

Usar `question` para apresentar os commits como itens com status `pending`. Isso permite ao usuario aprovar/editar/remover interagindo diretamente pela interface, sem necessidade de resposta textual no chat.

**Regra: NAO perguntar no chat — usar exclusivamente `question` para a aprovacao, mas sempre listar os commits primeiro via STEP 3.**

**Template do `question`:**

```json
{
  "todos": [
    {
      "content": "📋 COMMIT 1: {{TYPE}}(AB#{{TASK}}): {{MESSAGE}} → {{FILES}}",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "📋 COMMIT 2 (se houver): {{TYPE}}(AB#{{TASK}}): {{MESSAGE}} → {{FILES}}",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "✅ APROVAR TODOS (marcar este item como concluded para executar)",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "✏️  EDITAR commit #X (descrever alteracao)",
      "status": "pending",
      "priority": "low"
    },
    {
      "content": "🗑️  REMOVER commit #X",
      "status": "pending",
      "priority": "low"
    }
  ]
}
```

**Fluxo de aprovacao:**

1. Listar commits no chat (STEP 3)
2. Criar `question` com os commits + opcoes de acao
3. **AGUARDAR o usuario interagir com os todos na interface**
4. Quando usuario marcar "APROVAR TODOS" como `completed`:
   - Prosseguir para STEP 5 (commitar)
5. Se usuario marcar "EDITAR commit #X" ou "REMOVER commit #X":
   - Ajustar conforme solicitado
   - Atualizar o `question` com a nova lista de commits
   - Aguardar nova aprovacao

### STEP 5: Apos aprovacao → Commitar

```bash
git add <arquivo1> <arquivo2>
git commit -m "{{TYPE}}(AB#{{TASK}}): {{MESSAGE}}"
```

### STEP 6: Push

```bash
git push -u origin {{BRANCH}}
```

> Para pushes subsequentes (se houve mais de um commit), usar apenas `git push`.

---

## Mensagens de Commit

> **Regras completas em: `pr-config.md` Seção 10 (Conventional Commits)**

- **Idioma**: SEMPRE em **INGLÊS**. Nunca em português.
- **Formato**: `{{TYPE}}({{SCOPE}}): {{MESSAGE}}`
- **Scope**: `AB#{{TASK}}` para projetos projeto, `workbench` para `.workbench`
- **Tipos** (ver pr-config.md 10.2): `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `perf`, `style`
- **Nunca** adicionar `Co-authored-by` ou qualquer atribuição no commit.

---

## Guardrails

> Regras de commit message format em `pr-config.md` Seção 10.3.

| #   | Regra                                         | Acao                                                                                                                          |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Nunca `git add .` ou `git add -A`**         | Adicionar arquivos individualmente                                                                                            |
| 2   | **Nunca `git push --force` ou `-f`**          | Usar `git push` normal                                                                                                        |
| 3   | **Nunca commitar em `main` ou `release`**     | Sempre em branch de feature/fix                                                                                               |
| 4   | **Aprovacao humana obrigatoria via question** | So executar commits apos usuario marcar "APROVAR TODOS" como completed no question. Nunca usar chat para coleta de aprovacao. |
| 5   | **Nunca `Co-authored-by`**                    | Manter autoria exclusiva do usuario                                                                                           |
| 6   | **Commits em ingles**                         | `pr-config.md` 10.3.1 — idioma obrigatorio ingles                                                                            |
| 7   | **Nunca pular hooks**                         | Nao usar `--no-verify`, `-n` ou similares                                                                                     |

---

## Casos Especiais

### CASE 1: Amend no ultimo commit

Quando usuario dise "esqueci de adicionar um arquivo":

```bash
git add arquivo-que-faltou.ts
```

Apresentar via `question`:

```json
{
  "todos": [
    {
      "content": "📋 AMEND: {{TYPE}}(AB#{{TASK}}): {{MESSAGE}} + missing file",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "✅ APROVAR AMEND (marcar como concluded para executar)",
      "status": "pending",
      "priority": "high"
    }
  ]
}
```

**SEMPRE apresentar para aprovacao via question antes de executar amend.**

### CASE 2: Conflito de merge no push

Se `git push` falhar por conflito:

1. Reportar ao usuario
2. Sugerir: `git pull origin {{BRANCH}} --rebase`
3. Se houver conflito no rebase, parar e aguardar o usuario resolver

---

## Output

A skill retorna ao comando/agente chamador:

```json
{
  "tipo": "completed",
  "commits_realizados": [
    { "message": "feat(AB#1234): add user avatar upload", "arquivos": ["..."] }
  ],
  "push_ok": true,
  "branch": "feat/TASK-1234"
}
```

Em caso de erro:

```json
{
  "tipo": "error",
  "erro": "Falha ao fazer push",
  "comando": "git push -u origin feat/TASK-1234",
  "sugestao": "Fazer git pull origin feat/TASK-1234 --rebase"
}
```
