# Migração para Python

> Runtime Python 3.11+ para os scripts próprios do Workbench. Node permanece
> apenas para o OpenCode, adapters externos (Azure DevOps, Teams, MySQL) e o
> plugin `metrics.ts`.

## Bootstrap

O Workbench detecta Python de forma cross-platform (Linux, macOS, Windows):

1. `WB_PYTHON`, se definido;
2. `python3`, `python`, `py -3.11`, `py -3`, `python3.11`…;
3. validação real com `sys.version_info >= (3, 11)`;
4. rejeição de aliases da Microsoft Store (`WindowsApps`);
5. fallback para `uv` (instalação oficial) e Python gerenciado;
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

## Estrutura

```
src/workbench/
  cli.py            # dispatcher argparse, --json, logs
  config.py         # opencode.json / project-mapping.json
  paths.py          # raiz e diretórios
  process.py        # subprocess sem shell
  logging.py        # logs estruturados e timing
  commands/         # comandos por domínio
tests/
  unit/             # testes unitários
  integration/      # CLI via subprocess
  characterization/ # harness de paridade Node -> Python
  golden/           # saídas congeladas
```

## Comandos migrados (paridade validada)

| Legado | Novo |
|---|---|
| `validate-branch-name.js` | `wb validate branch` |
| `validate-spec-format.js` | `wb validate spec` |
| `repository-resolver.js` | `wb repo resolve` |
| `sprint.js` (definitions/validate/…) | `wb sprint …` |
| `pipeline.js` (state/select-agent/phase/report/…) | `wb pipeline …` |
| `ado.js` (resolve/parse/fallback) | `wb ado …` |
| `hotfix.js` (config/validators/gates) | `wb hotfix …` |
| `tech-debt-issue.js` | `wb issue tech-debt` |
| `teams-mentions.js` | `wb teams mentions` |
| `teams-message-shapes.js` | `wb teams shapes validate` |
| `migrate-spec-to-modular.js` | `wb spec migrate` |
| `rag-search.js` | `wb knowledge search` |
| `auto-doc.js` | `wb docs …` |
| `cycle-time.js` | `wb metrics cycle-time` |
| `reviewer-sort.js` | `wb reviewers sort` |
| `create-release.js` | `wb release` |
| `vision-utils.js` | `wb vision probe` |
| `mcp-image.js` | `uv run --frozen python -m workbench.mcp.image` |

> O MCP `mcp-image` agora é Python por padrão (`opencode.json` e `.mcp.json`).

## Harness de paridade

O harness executa os scripts Node legados e o novo CLI Python com as mesmas
entradas, normaliza caminhos/datas e compara `stdout`, `stderr` e exit code.

```bash
# capturar golden dos scripts Node atuais
python tests/characterization/run.py capture

# comparar implementação Python
python tests/characterization/run.py check --impl python
```

## Qualidade

```bash
uv run ruff check src tests
uv run ruff format --check src tests
uv run pytest --cov=workbench --cov-report=term-missing
```

## Próximas fases

- Fase 4: `sync claude/codex`, atualização dos comandos/docs e CI final.
- Fase 5: remoção dos scripts Node migrados e relatório final de paridade/benchmark.
