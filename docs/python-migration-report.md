# Relatório — Migração Node → Python

> **Status:** concluída
> **Runtime:** Python 3.11+ (stdlib) com `uv` para ambiente/ferramentas de dev
> **Testes Python:** 68

## Resultado

Os scripts próprios do Workbench foram reescritos em Python. O Node permanece
apenas onde é inevitável:

| Componente | Runtime | Motivo |
|---|---|---|
| `scripts/start-mysql-mcp.js` | Node | MCP server externo `mysql-mcp-server` |
| `.opencode/orchestrator/` | TypeScript | motor de contratos existente |
| `skill-creator` (scripts internos) | Node | ferramenta externa empacotada na skill |

O MCP padrão (`mcp-image`) é Python:

```bash
uv run --frozen python -m workbench.mcp.image
```

## Escopo removido

O modo empresarial e integrações associadas foram removidos:
Azure DevOps, Teams, sprint/PBI/PM validation, hotfix/backport e permissões
corporativas. O MySQL permanece como adapter opcional.

## Comandos

| Legado | Novo |
|---|---|
| `validate-branch-name.js` | `wb validate branch` |
| `validate-spec-format.js` | `wb validate spec` |
| `validate-pr-body.js` | `wb validate pr` |
| `repository-resolver.js` | `wb repo resolve` |
| `tech-debt-issue.js` | `wb issue tech-debt` |
| `migrate-spec-to-modular.js` | `wb spec migrate` |
| `rag-search.js` | `wb knowledge search` |
| `auto-doc.js` | `wb docs …` |
| `cycle-time.js` | `wb metrics cycle-time` |
| `reviewer-sort.js` | `wb reviewers sort` |
| `create-release.js` | `wb release --from-tag` |
| `sync-to-claude.js` / `sync-to-codex.js` | `wb sync …` |
| `vision-utils.js` | `wb vision probe` |
| `mcp-image.js` | `python -m workbench.mcp.image` |
| `pipeline.js` | `wb process …` |

Forma portátil:

```bash
uv run --frozen python -m workbench <command>
```

## Golden/regressão

Os golden files ficam em `tests/golden/` e cobrem os comandos core.

```bash
python tests/characterization/run.py check --impl python
```

## Benchmark

Mediana de 7 execuções, Windows 11, Node v22.23.2, Python 3.11.16.
Python executado direto do `.venv` (sem overhead de `uv run` por chamada).

| Comando | Node (ms) | Python (ms) |
|---|---:|---:|
| `repo resolve` | 53.8 | 185.6 |
| `vision probe` | 64.0 | 192.7 |
| `process validate` | — | ~190 |

O startup do Python é maior que o do Node neste ambiente, mas o objetivo —
eliminar a dependência de versão do Node para os scripts do Workbench — foi
atingido.

## Qualidade

```bash
uv run pytest
uv run ruff check src tests
uv run ruff format --check src tests
npm run validate
```

## Rollback

- Histórico Git preserva todos os scripts removidos.
- `C:\Repositories\workbench OLD` permanece como referência intacta.
