# Workbench

> Mesa de trabalho para agentes de IA em qualquer projeto — pessoal, open-source,
> acadêmico ou comercial.

## Visão geral

O Workbench é uma **base operacional reutilizável**. Ele não contém código de
aplicação: contém agentes, skills, comandos, templates, regras e um motor de
**processos composáveis**.

O núcleo é neutro e independente de empresa. Cada usuário ou time define o
processo que quer seguir em `.opencode/processes/<nome>/process.json`.

## Como funciona

1. Clone este repositório onde preferir.
2. Abra o agente na raiz do Workbench.
3. O Orquestrador lê o processo do projeto no catálogo mesclado.
4. Cada stage do processo é delegado ao agente definido.
5. Gates são executados via `wb process gate`.
6. O conhecimento gerado pode ser registrado no vault do projeto.

## Estrutura

```
workbench/
├── opencode.json              # Configuração principal do OpenCode
├── AGENTS.md                  # Roteamento e regras gerais
├── CLAUDE.md                  # Bootstrap do Claude Code
├── CONVENTIONS.md             # Padrões de código, teste e API
├── .opencode/
│   ├── agents/                # Agentes genéricos
│   ├── skills/                # Playbooks técnicos
│   ├── commands/              # Comandos base
│   ├── processes/             # Processos definidos pelo usuário
│   │   ├── schema.json
│   │   ├── _template/
│   │   └── default/
│   ├── config/                # Catálogos e convenções
│   ├── rules/                 # Regras universais
│   ├── templates/             # Templates de spec, bug, feature, ADR, PR
│   ├── orchestrator/          # Validação de contratos
│   └── scripts/               # Automações auxiliares
├── projects/                  # Conhecimento por projeto
├── scripts/                   # Bootstrap e wrappers
├── docs/                      # Documentação complementar
└── .github/workflows/ci.yml   # CI
```

## Configuração

### Runtime Python

Os scripts próprios do Workbench rodam em Python 3.11+ (stdlib, `.venv`, `uv`).
O bootstrap detecta o Python do sistema e, se necessário, instala um Python
gerenciado via `uv`:

```bash
# Linux/macOS
./scripts/bootstrap.sh doctor

# Windows
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap.ps1 doctor

# Atalho
./scripts/wb doctor          # Linux/macOS
scripts\wb.cmd doctor        # Windows
```

Variáveis úteis: `WB_PYTHON`, `WB_PYTHON_VERSION`, `WB_NO_INSTALL=1`.

### Adicionar um projeto

Crie os metadados em `projects/<slug>/project.json`:

```json
{
  "slug": "meu-projeto",
  "name": "Meu Projeto",
  "description": "Descrição curta",
  "repos": { "api": "meu-projeto-api" },
  "knowledge": "projects/meu-projeto/knowledge",
  "agents": ["backend-dev"],
  "vault": "projects/meu-projeto/obsidian-vault",
  "process": "default",
  "license": "MIT",
  "tracker": "none"
}
```

O Workbench descobre automaticamente os repositórios com `.git` na raiz do
workspace e em `discovery.roots` (ou `WB_PROJECT_ROOTS`), sempre dentro do
workspace. Se `repos` for omitido e houver apenas um repositório cujo nome seja o slug ou comece com
`<slug>-`, ele é associado automaticamente; para vários repositórios, declare os papéis no manifesto.

```bash
uv run --frozen python -m workbench projects scan   # inspeção sem escrita
uv run --frozen python -m workbench projects sync   # grava o catálogo local
uv run --frozen python -m workbench projects list   # catálogo mesclado
```

Use `/new-project` para criar a estrutura do zero. O catálogo descoberto fica em
`.opencode/config/project-mapping.local.json` (ignorado pelo git); o
`project-mapping.json` base serve apenas para o workbench e overrides explícitos.

### Criar um processo

```bash
uv run --frozen python -m workbench process init meu-fluxo
```

Edite `.opencode/processes/meu-fluxo/process.json` e aponte no projeto:

```json
{ "process": "meu-fluxo" }
```

Processos podem ser globais (`.opencode/processes/`) ou específicos do projeto
(`projects/<slug>/processes/`).

## Catálogo de projetos

| Comando | Função |
|---|---|
| `wb projects scan` | Descobre projetos/repos sem gravar |
| `wb projects sync` | Atualiza `.opencode/config/project-mapping.local.json` |
| `wb projects list` | Lista o catálogo mesclado |

## Motor de processos

| Comando | Função |
|---|---|
| `wb process list` | Lista processos |
| `wb process show <name>` | Mostra stages, gates e artefatos |
| `wb process validate [name]` | Valida schema e referências |
| `wb process init <name>` | Cria processo a partir do template |
| `wb process plan <name>` | Gera o plano para o orquestrador |
| `wb process state create/load/resume` | Gerencia estado |
| `wb process gate <name> <gate>` | Executa ou registra gate |
| `wb process status <name> <slug>` | Status resumido |
| `wb process report <name> <slug> success\|partial` | Relatório |

## Agentes

Consulte `.opencode/config/agent-catalog.json` e
`.opencode/config/agent-registry.md`.

| Categoria | Agentes |
|-----------|---------|
| **Core** | orquestrador |
| **Development** | backend-dev, frontend-dev, database-dev, pedreiro, perf-auditor, tdd-guide |
| **Review** | revisor, code-reviewer, security-reviewer, tech-architect, tech-lead, sec-arch |
| **Process** | scrum-master, business-analyst, product-manager |
| **Infrastructure** | devops-engineer, qa-engineer, general |
| **Analysis** | explorador, explore, image-analyzer, ux-analyzer, integracoes-power |
| **Project** | vault-updater |
| **Decision** | arbitro, gestor-tokens, planner, architect |

## Skills e comandos

Catálogo: `.opencode/config/skills-catalog.md` e `.opencode/commands/`.

Destaques: `/process`, `/execute-spec`, `/review-all`, `/git-pr`,
`/new-feature`, `/new-bug`, `/new-project`, `/metrics`, `/wiki`.

### Caveman — compressão de tokens

Ativo por padrão em modo `lite`, reduzindo filler sem perder precisão.
`/caveman lite|full|ultra` alterna; `stop caveman` desativa.

## Licença

MIT — veja [LICENSE](LICENSE). O código gerado em cada projeto segue a licença
do próprio projeto. Skills externas mantêm suas licenças; veja
`THIRD_PARTY_NOTICES.md`.

## Segurança

| Regra | Comportamento |
|-------|---------------|
| Nunca commitar em `main`/`release` | Agente cria branch |
| Nunca aprovar/mergear PRs | Agente recusa e reporta |
| Nunca `git add .` / `-A` | Arquivos adicionados individualmente |
| Nunca `git push --force` | Comando rejeitado |
| Nunca pular hooks | `--no-verify` não é usado |
| Nunca resolver conflitos | Conflito reportado ao humano |
| Nunca expor secrets | `.env` está no `.gitignore` |
