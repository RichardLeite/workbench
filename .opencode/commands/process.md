---
description: "Executa o processo definido pelo projeto"
---

# /process

> Executa o processo do projeto definido no catálogo mesclado.

## Uso

```bash
uv run --frozen python -m workbench process list
uv run --frozen python -m workbench process show default
uv run --frozen python -m workbench process plan default
```

## Fluxo

1. Identifique o projeto e leia `<slug>.process` no catálogo mesclado.
2. Carregue o processo com `wb process show <name>`.
3. Gere o plano com `wb process plan <name>`.
4. Siga os `stages` na ordem, delegando ao `agent` de cada stage.
5. Execute gates bloqueantes com `wb process gate <name> <gate> --slug <slug>`.
6. Atualize o estado com `wb process state create/load/resume`.
7. Ao final, gere o relatório com `wb process report`.

## Regras

- Stages opcionais podem ser pulados.
- Gate bloqueante falhando interrompe o processo.
- Não invente etapas: se o processo não define, não execute.
- Para mudar o fluxo, edite `.opencode/processes/<name>/process.json`.
