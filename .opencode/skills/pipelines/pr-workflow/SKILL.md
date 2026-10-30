---
name: pr-workflow
description: Complete pull request workflow — commit changes, create PR, and optionally run code review.
composes:
  - commit
  - pr
  - code-review
---

# PR Workflow Pipeline

## Visão Geral

Pipeline de pull request em **2 fases sequenciais** (+ 1 opcional).

```
Fase 1 (commit)
  └→ Commitar alterações na branch → SHA, files

Fase 2 (pr)
  └→ Abrir Pull Request no GitHub → PR URL, number, title

[Opcional] Fase 3 (code-review)
  └→ Code review do PR → comentários, sugestões

Consolidar → resumo final com PR link, status, alertas
```

## Fase 1 — Commit

Use a skill `commit`. Saída: SHA(s), arquivos, branch.

## Fase 2 — PR

Use a skill `pr` com `base`, `head`, `issue` e `context`.

## Fase 3 — Review (opcional)

Use a skill `code-review`; nunca aprove ou mergeie automaticamente.

## Regras

- Nunca commitar em branch protegida.
- Nunca aprovar/mergear PR.
- Seguir o template de `pr-config.md`.
