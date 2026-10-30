# Workbench

> Mesa de trabalho para agentes de IA (OpenCode, Claude Code, Codex CLI): agentes,
> skills, comandos, regras e templates prontos para usar em qualquer projeto.

## Visão geral

O Workbench é uma **base operacional reutilizável**. Ele não contém código de
aplicação: contém o ambiente que faz agentes de IA trabalharem com consistência —
roteamento, contratos de output, convenções, automações e conhecimento.

O núcleo é genérico e independente de empresa. Integrações corporativas
(Azure DevOps, Teams, MySQL) são **adapters opcionais**, desativados por padrão.

## Como funciona

1. Clone este repositório onde preferir (ele não precisa ficar dentro do projeto).
2. Abra o agente na raiz do Workbench.
3. O **Orquestrador** identifica o contexto e delega para o agente especializado.
4. Cada agente retorna output validado por contrato.
5. O conhecimento gerado pode ser registrado no vault do projeto.

## Estrutura

```
workbench/
├── opencode.json              # Configuração principal do OpenCode
├── AGENTS.md                  # Roteamento multi-projeto
├── CLAUDE.md                  # Bootstrap do Claude Code
├── CONVENTIONS.md             # Padrões de código, teste, API e DoD
├── .opencode/
│   ├── agents/                # Agentes (core, development, review, ...)
│   ├── skills/                # Playbooks automatizados
│   ├── commands/              # Comandos personalizados
│   ├── config/                # Catálogos, convenções e regras de fluxo
│   ├── rules/                 # Regras carregadas por todos os agentes
│   ├── templates/             # Templates de PR, spec, bug, feature, ADR
│   ├── orchestrator/          # Motor de validação de contratos
│   ├── playbooks/             # Fluxos operacionais
│   └── scripts/               # Automações (sprint, release, métricas, RAG)
├── projects/                  # Conhecimento por projeto (começa com _template)
├── scripts/                   # Wrappers de MCP e validadores
├── docs/                      # Documentação complementar
└── .github/workflows/ci.yml   # CI (lint, JSON, integridade, testes)
```

## Configuração

### Runtime Python (novo)

Os scripts próprios do Workbench estão migrando para Python 3.11+ (stdlib,
`.venv` local, `uv`). O bootstrap detecta o Python do sistema e, se necessário,
instala um Python gerenciado via `uv`:

```bash
# Linux/macOS
./scripts/bootstrap.sh doctor

# Windows (PowerShell)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap.ps1 doctor

# Atalho
./scripts/wb doctor          # Linux/macOS
scripts\wb.cmd doctor        # Windows
```

Variáveis úteis: `WB_PYTHON`, `WB_PYTHON_VERSION`, `WB_NO_INSTALL=1`,
`WB_ASSUME_YES=1`. Detalhes em [`docs/python-migration.md`](docs/python-migration.md).

> Os scripts Node legados continuam no repositório até a paridade ser concluída.

### 1. Dependências Node (adapters opcionais)

```bash
npm install
cd .opencode/orchestrator && npm install
```

### 2. Adapters opcionais

Azure DevOps, Teams e MySQL vêm **desativados**. Para usar, preencha o `.env`
(`cp .env.example .env`) e habilite o MCP correspondente em `opencode.json`.

### 3. Adicionar um projeto

Edite `.opencode/config/project-mapping.json`:

```json
{
  "projects": {
    "meu-projeto": {
      "name": "Meu Projeto",
      "description": "Descrição curta",
      "repos": { "api": "meu-projeto-api", "app": "meu-projeto-app" },
      "knowledge": "projects/meu-projeto/knowledge",
      "agents": ["backend-dev", "frontend-dev"],
      "vault": "projects/meu-projeto/obsidian-vault"
    }
  }
}
```

O comando `/new-project` cria a estrutura do zero.

### 4. Claude Code / Codex (opcional)

`.opencode/` é a fonte única da verdade. As camadas por ferramenta são derivadas:

```bash
npm run sync:claude
npm run sync:codex
```

## Agentes

Consulte `.opencode/config/agent-catalog.json` e `.opencode/config/agent-registry.md`.

| Categoria | Agentes |
|-----------|---------|
| **Core** | orquestrador |
| **Development** | backend-dev, frontend-dev, database-dev, pedreiro, perf-auditor, tdd-guide |
| **Review** | revisor, code-reviewer, security-reviewer, tech-architect, tech-lead, pr-insight, sec-arch |
| **Process** | scrum-master, business-analyst, product-manager, task-refiner-ado (opcional) |
| **Infrastructure** | devops-engineer, qa-engineer, general |
| **Analysis** | explorador, explore, image-analyzer, ux-analyzer, integracoes-power |
| **Project** | vault-updater |
| **Decision** | arbitro, gestor-tokens, planner, architect |

## Skills e comandos

Catálogo: `.opencode/config/skills-catalog.md` e `.opencode/commands/`.

Destaques: `/pipeline`, `/execute-spec`, `/review-all`, `/git-sprint`,
`/git-hotfix`, `/new-feature`, `/new-bug`, `/new-project`, `/metrics`, `/wiki`.

### Caveman — compressão de tokens

Ativo por padrão em modo `lite`, reduzindo filler sem perder precisão.
`/caveman lite|full|ultra` alterna; `stop caveman` desativa.

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

## Licença

MIT — veja [LICENSE](LICENSE).
