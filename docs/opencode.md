# OpenCode Workbench — Guia de Uso

Este guia explica como usar o workbench. Para configurações técnicas que o agente
usa, consulte o `AGENTS.md`.

## O que é

O workbench é o lugar onde a gente guarda tudo que o agente precisa saber: regras
de como trabalhar, contexto dos projetos, templates de PR, e ferramentas que
automatizam tarefas repetitivas.

O **OpenCode** é o agente que lê essas configurações e trabalha do seu lado.
Quando você abre o OpenCode na raiz do workbench, ele começa perguntando em
qual contexto você quer trabalhar e então aplica as regras correspondentes.

## Como começar

1. Clone este repositório
2. Clone os repositórios dos projetos na raiz do workbench
3. Abra o OpenCode na raiz

Pronto. O agente vai pedir o contexto de trabalho antes de começar.

## Como a gente trabalha

Toda conversa começa com uma pergunta de roteamento:

```text
Em qual contexto vamos trabalhar?
- .workbench
- <projeto registrado>
- outro projeto
```

## MCPs globais

O `opencode.json` da raiz do `.workbench` carrega a configuração global do ambiente.

- `mcp-image` fica ativo por padrão (sem dependências externas).
- `azure-devops`, `teams-graph` e `mysql` são **adapters opcionais**, desativados por padrão.

Para usar um adapter, preencha o `.env` e mude `"enabled": true` no MCP correspondente
em `opencode.json`.

## Fluxo do `.workbench`

Use este contexto quando a mudança for nas regras, skills, templates, comandos
e documentação do próprio workbench.

- Base principal: `main`
- Não exige `TASK`
- Sempre abre PR para `main`

Exemplo:

```bash
git checkout main && git pull
git checkout -b feat/new-issue-command
# implementa...
git push -u origin feat/new-issue-command
# abre PR para main
```

Commits do `.workbench` seguem Conventional Commits com escopo `workbench`:

```text
feat(workbench): add /new-issue command
```

## Fluxo de `projects/<nome>`

Para projetos dentro de `projects/`, o comportamento atual continua baseado em
**RELEASE** e **HOTFIX**.

### RELEASE

É quando você vai implementar uma feature nova, refatorar algo ou fazer uma
melhoria. Você cria uma branch a partir de `release` e abre um PR de volta
para ela quando terminar.

Exemplo: você vai adicionar um endpoint de retry de invoice.

```
git checkout release && git pull
git checkout -b feat/AB#1234-retry-invoice
# implementa...
git push -u origin feat/AB#1234-retry-invoice
# abre PR para release
```

### HOTFIX

É quando algo quebrou em produção e precisa ser corrigido com urgência. Você
cria uma branch a partir de `main`, corrige, abre PR para `main`, e depois faz
um backport para `release`.

Exemplo: o cálculo de fee está afetando valores de NFe.

```
git checkout main && git pull
git checkout -b fix/AB#19529-fix-fee-nfe
# corrige...
git push -u origin fix/AB#19529-fix-fee-nfe
# abre PR para main
# depois abre PR de backport para release
```

Antes de começar um trabalho em `projects/<nome>`, o agente pergunta: é
RELEASE ou HOTFIX? Qual o TASK id? Qual repo é afetado?

## Commits

Os commits seguem Conventional Commits, com formato dependente do contexto:

```
.workbench -> tipo(workbench): descrição
projects/<nome> -> tipo(AB#TASK): descrição
```

- **tipo** diz o que você fez: `feat` (feature nova), `fix` (correção),
  `refactor` (refatoração), `perf` (otimização), `test` (teste),
  `chore` (tarefa), `docs` (documentação)
- **AB#TASK** é obrigatório apenas para projetos que usam TASK
- **descrição** diz o que mudou, em inglês, no passado

Exemplos reais:

- `feat(AB#1234): add invoice retry endpoint`
- `fix(AB#19529): prevent fee from affecting nfe values`
- `refactor(AB#1234): use Sequelize attributes for performance`
- `perf(AB#1234): optimize order listing query`

Regra simples: cada commit faz uma coisa só. Se você está consertando bug e
refatorando ao mesmo tempo, são dois commits.

## Como o agente te ajuda

Você conversa com o agente pelo terminal. Ele entende contexto, faz perguntas
quando precisa, e segue as regras do projeto.

### Exemplos de uso

| Contexto | Exemplo |
|----------|---------|
| `.workbench` | "No .workbench, adiciona um comando /new-issue" |
| Estratégia | "Preciso priorizar as features do próximo release" |
| Bug | "Corrige o bug #1234 — o cálculo de fee está errado" |
| Feature | "Adiciona a feature #5678 — usuário precisa ver histórico de pedidos" |
| Revisão | "Analisa o PR #42 e me diz o que melhorar" |
| Especificação | "Cria uma spec para o bug que encontrei" |

### Como o orquestrador decide qual agente chamar

O orquestrador classifica sua tarefa em uma das categorias abaixo e delega
para o agente mais adequado:

| Sua task envolve... | Agente chamado |
|---------------------|----------------|
| Estratégia de produto, roadmap | `product-manager` |
| Refinamento de requisitos, specs | `business-analyst` |
| Processo ágil, métricas, sprints | `scrum-master` |
| Arquitetura, ADRs, design decisions | `tech-architect` |
| Plano de implementação (pré-código) | `tech-lead` |
| Implementação backend | `backend-dev` |
| Implementação frontend | `frontend-dev` |
| Banco de dados, migrations | `database-dev` |
| Implementação genérica | `pedreiro` |
| Busca no código | `explorador` / `explore` |
| Análise de PR (pré-submissão) | `pr-insight` |
| Code review, debugging | `revisor` |
| Testes, planos de teste | `qa-engineer` |
| Deploy, CI/CD | `devops-engineer` |
| UX, acessibilidade | `ux-analyzer` |
| Análise de imagens/layout | `image-analyzer` |
| **Conflito ou baixa confiança** | `arbitro` (escalação) |
| **Auditoria de custo de tokens** | `gestor-tokens` |

Os dois últimos (`arbitro` e `gestor-tokens`) são agentes de **suporte à
decisão** — não são chamados por padrão, apenas quando necessário.

### PRs e Revisão

Quando você termina o código, use `/pr-analyze` para análise completa do diff:
verifica corretude, segurança e convenções, e sugere melhorias. Depois da
análise, o sistema pergunta se deseja criar o PR e, se o adapter estiver
habilitado, notificar o time.

Se o bot do GPT-4o-mini comentar sugestões no PR, o agente pode processá-las
com `/review-bot`.

Para referência técnica (skills, templates, branching, ADR), consulte o
`AGENTS.md`.
