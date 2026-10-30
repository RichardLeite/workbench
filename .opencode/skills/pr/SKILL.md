---
name: pr
description: Cria Pull Requests no GitHub usando MCP First e gh CLI fallback, com template centralizado em pr-config.md.
---

# Pull Request

## Goal

Criar um Pull Request com evidências objetivas, seguindo MCP First / gh CLI Fallback.

> Todo PR body deve seguir o template da Seção 3 de `.opencode/config/pr-config.md`.

## Parameters

- `base`: branch alvo (`main` ou a base do processo)
- `head`: branch de origem
- `issue`: issue relacionada (opcional, ex: `#123`)
- `context`: `.workbench` ou projeto

## Procedure

### STEP 1 — Verificar GitHub

```bash
which gh && gh auth status
```

- MCP GitHub disponível → usar como método primário
- Sem MCP ou falha → usar `gh` CLI

### STEP 2 — Validar branch

- `head` não pode ser `main`/`release`.
- `base` deve ser a base definida pelo processo do projeto.
- Diff deve conter apenas arquivos relevantes.

### STEP 3 — Título

```
type(scope): descrição em inglês
```

### STEP 4 — Corpo

Preencher o template de `pr-config.md` Seção 3:
- O que mudou
- Por quê
- Evidências
- Riscos
- Rollback
- Commits
- Checklist

### STEP 5 — Criar PR

MCP: ferramenta de criação de PR.
Fallback:

```bash
gh pr create --base <base> --head <head> --title "<title>" --body-file <file>
```

### STEP 6 — Retornar

```json
{
  "ok": true,
  "number": 123,
  "url": "https://github.com/owner/repo/pull/123",
  "title": "...",
  "base": "main",
  "head": "feat/add-feature"
}
```

## Guardrails

- Nunca aprovar ou mergear o PR.
- Nunca usar `--force`.
- Nunca commitar secrets.
- Se houver conflito, reportar ao humano.
