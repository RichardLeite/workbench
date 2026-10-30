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
| `pipeline.js` (select-agent/validate/phase/…) | `wb pipeline …` |
| `ado.js` (resolve/parse/fallback) | `wb ado …` |
| `hotfix.js` (config/validators/gates) | `wb hotfix …` |

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

- Fase 1 restante: `tech-debt`, `teams-*`, `rag-search`, `auto-doc`, `cycle-time`,
  `reviewer-sort`, `spec migrate`.
- Fase 2: `create-release` e fluxos de release.
- Fase 3: `vision-utils` + `mcp-image` em Python.
- Fase 4: `sync claude/codex`, docs/comandos e CI final.
- Fase 5: remoção dos scripts Node migrados.
