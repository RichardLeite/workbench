---
description: Search knowledge vault(s) for relevant project knowledge
---

Search the project vault(s) for "$ARGUMENTS".

> **Contexto define escopo:**
> - Se o contexto da conversa for um projeto específico (ex: `meu-projeto`,
>   `fiscal`), busca APENAS no vault desse projeto.
> - Se não houver contexto claro, busca em **TODOS os vaults** disponíveis
>   (resultados são prefixados com `[projeto]`).

1. Execute: `uv run --frozen python -m workbench knowledge search "$ARGUMENTS" --limit 5 [--project <context>]`
   - Omita `--project` para buscar em todos os vaults
2. Read the top 2 matching notes in full
3. Read snippets of the next 3
4. Cite the sources: > **Fonte: [[nota.md]]**
5. Summarize the findings
