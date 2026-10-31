# OpenCode Workbench — Guia de Uso

Este guia explica como usar o Workbench. Para configuração técnica, consulte o
`AGENTS.md`.

## O que é

O Workbench guarda tudo que o agente precisa saber: regras, contexto dos
projetos, templates, agentes, skills e processos. O **OpenCode** lê essas
configurações e trabalha do seu lado.

## Como começar

1. Clone este repositório.
2. Clone os repositórios dos projetos na raiz do Workbench.
3. Abra o OpenCode na raiz.

O agente pergunta o contexto de trabalho antes de começar.

## Contextos

```text
Em qual contexto vamos trabalhar?
- .workbench
- <projeto registrado>
- outro projeto
```

## MCPs

- `mcp-image` fica ativo por padrão (sem dependências externas).
- `mysql` é um adapter opcional, desativado por padrão.

Para usar MySQL, preencha o `.env` e mude `"enabled": true` no MCP
correspondente em `opencode.json`.

## Projetos e descoberta

Os projetos são descobertos automaticamente a partir dos checkouts git na raiz
do workspace e em `discovery.roots`/`WB_PROJECT_ROOTS` dentro dele. Os metadados ficam em
`projects/<slug>/project.json`; sem esse arquivo, o nome vem do `AGENTS.md` ou do
diretório. Para vários repositórios, declare os papéis em `repos`.

```bash
uv run --frozen python -m workbench projects scan
uv run --frozen python -m workbench projects sync
uv run --frozen python -m workbench projects list
uv run --frozen python -m workbench projects exclude

Para repos clonados na raiz, `wb projects exclude` mantém o
`.git/info/exclude` sincronizado sem alterar o `.gitignore` versionado.
```

O resultado local é gravado em `.opencode/config/project-mapping.local.json`
(ignorado pelo git) e mesclado com o `project-mapping.json` base. O plugin do
OpenCode injeta os aliases `@` em memória; o CLI e o hook `SessionStart` do
Claude atualizam o catálogo no carregamento. Use `WB_NO_DISCOVERY=1` para
desativar a atualização automática.

## Processos

Cada projeto escolhe um processo no catálogo mesclado:

```json
{ "process": "default" }
```

O processo define stages, agentes, gates e artefatos:

```bash
uv run --frozen python -m workbench process show default
uv run --frozen python -m workbench process plan default
```

Crie um processo próprio:

```bash
uv run --frozen python -m workbench process init meu-fluxo
```

Edite `.opencode/processes/meu-fluxo/process.json` ou
`projects/<slug>/processes/meu-fluxo/process.json`.

## Fluxo do `.workbench`

- Base: `main`
- Sempre branch + PR
- Sem prefixo de task obrigatório

```bash
git checkout main && git pull
git checkout -b feat/new-issue-command
# implementa...
git push -u origin feat/new-issue-command
# abre PR para main
```

Commits do `.workbench`:

```text
feat(workbench): add /new-issue command
```

## Fluxo de `projects/<nome>`

O fluxo vem do processo escolhido. O processo pode ser tão simples quanto:

```
discover → plan → implement → test → review → docs
```

ou incluir gates, módulos, releases e etapas específicas do time.

Use `/git-pr` para branch + PR genérico, ou o comando `/process` para seguir o
processo do projeto.

## Commits

```
.workbench -> tipo(workbench): descrição
projects/<nome> -> tipo(escopo): descrição
```

Tipos: `feat`, `fix`, `refactor`, `perf`, `test`, `chore`, `docs`.
Cada commit faz uma coisa só.

## Como o agente te ajuda

| Contexto | Exemplo |
|----------|---------|
| `.workbench` | "No .workbench, adiciona um comando /new-issue" |
| Estratégia | "Preciso priorizar as features do próximo ciclo" |
| Bug | "Corrige o bug #1234 — o cálculo de fee está errado" |
| Feature | "Adiciona a feature #5678 — usuário precisa ver histórico" |
| Revisão | "Analisa o PR #42 e me diz o que melhorar" |
| Especificação | "Cria uma spec para o bug que encontrei" |

O orquestrador segue o processo do projeto e delega para os agentes definidos
nele. Para referência técnica (skills, templates, branching), consulte o
`AGENTS.md`.
