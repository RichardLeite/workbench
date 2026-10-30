# Migração para Python

> Runtime Python 3.11+ para os scripts próprios do Workbench. Node permanece
> apenas no adapter MySQL, no orquestrador TypeScript e em ferramentas externas
> do `skill-creator`.

## Bootstrap

O Workbench detecta Python de forma cross-platform (Linux, macOS, Windows):

1. `WB_PYTHON`, se definido;
2. `python3`, `python`, `py -3.11`, `py -3`, `python3.11`…;
3. validação real com `sys.version_info >= (3, 11)`;
4. rejeição de aliases da Microsoft Store (`WindowsApps`);
5. fallback para `uv` e Python gerenciado;
6. criação de `.venv` e `uv sync`.

```bash
# Linux/macOS
./scripts/bootstrap.sh version

# Windows
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap.ps1 version
```

Atalhos:

```bash
./scripts/wb doctor          # Linux/macOS
scripts\wb.cmd doctor        # Windows
```

Forma portátil nos comandos:

```bash
uv run --frozen python -m workbench <command>
```

## Estrutura

```
src/workbench/
  cli.py               # dispatcher argparse, --json, logs
  config.py            # opencode.json / project-mapping.json
  paths.py             # raiz e diretórios
  process.py           # execução de subprocessos
  process_engine.py    # motor de processos composáveis
  logging.py           # logs estruturados e timing
  commands/            # comandos por domínio
tests/
  unit/
  integration/
  characterization/    # golden/regressão
  golden/
```

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

## Qualidade

```bash
uv run pytest
uv run ruff check src tests
uv run ruff format --check src tests
npm run validate
```

## Relatório

Paridade, benchmarks e inventário final:
[`python-migration-report.md`](python-migration-report.md).
