# Orquestrador Memory — Active Context

> Memória leve sempre em contexto. Capacidade: ~3.000 chars (~1.200 tokens).
> Quando cheia, consolidar entradas antigas.

```
────────── ORQUESTRADOR MEMORY [usage: 0/3000 chars] ──────────
```

## Projeto

- `.workbench` — infraestrutura de orquestração, agentes, skills e vault
- Projetos registrados em `project-mapping.json`
- Stack: OpenCode engine + Node.js + markdown agents/skills

## Agentes

- Orquestrador: GOAP agent router, subagentes registrados em `agent-registry.md`
- Preferir agente específico sobre genérico quando o domínio é claro
- Core: backend-dev, frontend-dev, database-dev, pedreiro, revisor, tech-architect, explorador, qa-engineer, devops-engineer, gestor-tokens, arbitro
- Nunca delegar sem validar JSON output

## Preferências do Usuário

- Respostas diretas, sem floreio
- Português para regras de negócio, inglês para código
- Nunca fazer push sem autorização explícita
- Nunca auto-aprovar commits

## Lições Aprendidas

### Git & Push (Windows)
- `git push` falha se `$env:GITHUB_TOKEN` ou `$env:GH_TOKEN` estiverem setados com token inválido
- Limpar com: `$env:GITHUB_TOKEN = ""; $env:GH_TOKEN = ""`
- Token do `gh auth token` funciona para push via `gh auth setup-git`

### Projetos Locais
- Cada projeto declara stack e convenções no próprio `AGENTS.md`
- Resolver disponibilidade com `.opencode/scripts/repository-resolver.js`

### Vault / Knowledge
- Vault precisa ser seeded manualmente — RAG sem notas não retorna nada
- Ao criar skill, sempre incluir SKILL.md com frontmatter padrão
- Preferir patch/edit sobre criar do zero

## Write Approval Gate

`write_approval: false` — quando `true`, perguntar antes de salvar nota no vault.
Mudar via: `write_approval on` / `write_approval off`.
