# Relatório — Migração Node → Python

> **Status:** concluída
> **Runtime:** Python 3.11+ (stdlib) com `uv` para ambiente/ferramentas de dev
> **Paridade:** 36 casos golden Node ↔ Python
> **Testes Python:** 94

## Resultado

Os scripts próprios do Workbench foram reescritos em Python com Clean Room,
mantendo os contratos de CLI, exit codes e saídas JSON. O Node permanece apenas
onde é inevitável:

| Componente | Runtime | Motivo |
|---|---|---|
| `scripts/start-azure-devops-mcp.js` | Node | MCP server externo `@azure-devops/mcp` |
| `scripts/start-teams-graph-mcp.js` | Node | MCP server externo `@floriscornel/teams-mcp` |
| `scripts/start-mysql-mcp.js` | Node | MCP server externo `mysql-mcp-server` |
| `scripts/discover-teams.js`, `scripts/list-teams-mcp.js` | Node | helpers dos adapters Teams |
| `scripts/lib/ensure-node-version.js` | Node | bootstrap dos adapters Node |
| `.opencode/orchestrator/` | TypeScript | motor de contratos existente |
| `skill-creator` (scripts internos) | Node | ferramenta externa empacotada na skill |

O MCP padrão do Workbench (`mcp-image`) agora é Python:

```bash
uv run --frozen python -m workbench.mcp.image
```

## Scripts removidos

- `.opencode/scripts/`: `ado`, `auto-doc`, `create-release`, `cycle-time`,
  `hotfix`, `pipeline`, `rag-search`, `repository-resolver`, `reviewer-sort`,
  `sprint`, `sync-to-claude`, `sync-to-codex`.
- `scripts/`: `validate-branch-name`, `validate-pr-body`, `validate-spec-format`,
  `tech-debt-issue`, `migrate-spec-to-modular`, `teams-mentions`,
  `teams-message-shapes`, `vision-utils`, `mcp-image`, `debug-mdtohtml`.
- Testes Node correspondentes em `.opencode/scripts/tests/` e `scripts/tests/`.

## Comandos

| Legado | Novo |
|---|---|
| `validate-branch-name.js` | `wb validate branch` |
| `validate-spec-format.js` | `wb validate spec` |
| `validate-pr-body.js` | `wb validate pr` |
| `repository-resolver.js` | `wb repo resolve` |
| `sprint.js` | `wb sprint …` |
| `pipeline.js` | `wb pipeline …` |
| `ado.js` | `wb ado …` |
| `hotfix.js` | `wb hotfix …` |
| `tech-debt-issue.js` | `wb issue tech-debt` |
| `teams-mentions.js` / `teams-message-shapes.js` | `wb teams …` |
| `migrate-spec-to-modular.js` | `wb spec migrate` |
| `rag-search.js` | `wb knowledge search` |
| `auto-doc.js` | `wb docs …` |
| `cycle-time.js` | `wb metrics cycle-time` |
| `reviewer-sort.js` | `wb reviewers sort` |
| `create-release.js` | `wb release` |
| `sync-to-claude.js` / `sync-to-codex.js` | `wb sync …` |
| `vision-utils.js` | `wb vision probe` |
| `mcp-image.js` | `python -m workbench.mcp.image` |

Forma portátil nos comandos e skills:

```bash
uv run --frozen python -m workbench <command>
```

## Paridade

O harness executa o legado Node e o novo CLI Python com as mesmas entradas,
normaliza caminhos/timestamps e compara `stdout`, `stderr` e exit code.

```bash
python tests/characterization/run.py check --impl python
```

Casos cobertos: branch/spec, sprint, pipeline, ADO, hotfix, repo resolver,
docs, knowledge search, metrics, teams shapes, spec migration e vision probe.

> Os golden files ficam congelados em `tests/golden/`. Após a remoção dos scripts
> Node, `capture` não é mais necessário; `check --impl python` continua válido.

## Benchmark

Mediana de 7 execuções, Windows 11, Node v22.23.2, Python 3.11.16.
Python executado direto do `.venv` (sem overhead de `uv run` por chamada).

| Comando | Node (ms) | Python (ms) |
|---|---:|---:|
| `repo resolve` | 53.8 | 185.6 |
| `sprint definitions` | 50.0 | 186.5 |
| `ado parse` | 51.9 | ~190 |
| `knowledge search` | 49.8 | ~190 |
| `vision probe` | 64.0 | 192.7 |

O startup do Python é maior que o do Node neste ambiente, mas o objetivo da
migração — eliminar a dependência de versão do Node para os scripts do
Workbench — foi atingido. Os comandos são de execução curta e esporádica; o
impacto absoluto é de ~130 ms por chamada.

## Qualidade

```bash
uv run pytest
uv run ruff check src tests
uv run ruff format --check src tests
npm run validate:all
```

## Rollback

- Histórico Git preserva todos os scripts removidos.
- `C:\Repositories\workbench OLD` permanece como referência intacta.
