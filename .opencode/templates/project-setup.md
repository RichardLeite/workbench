# Checklist de Setup de Projeto

Use esta checklist para adicionar um novo projeto ao workbench.

## Passos

1. Crie o diretório do projeto:

```bash
mkdir -p projects/<nome-do-projeto>
mkdir -p projects/<nome-do-projeto>/knowledge/backlog
mkdir -p projects/<nome-do-projeto>/knowledge/specs
mkdir -p projects/<nome-do-projeto>/knowledge/decisions
mkdir -p projects/<nome-do-projeto>/agents
```

2. Crie o AGENTS.md específico do projeto em `projects/<nome-do-projeto>/AGENTS.md`

3. Clone os repositórios do projeto na raiz do workbench:

```bash
git clone <repo-url> <nome-do-repo>
```

4. Adicione conhecimento específico do projeto:
   - `knowledge/backlog/00-backlog.md` - backlog inicial
   - `knowledge/specs/00-repo-map.md` - estrutura e stack do repo
   - `knowledge/specs/01-architecture.md` - decisões de arquitetura

5. Opcionalmente adicione agentes específicos em `agents/`

6. Atualize o `README.md` do root com o novo projeto

## Template de AGENTS.md do Projeto

O AGENTS.md do projeto deve incluir:

- Stack tecnológica (linguagem, framework, banco)
- Estrutura dos repositórios
- Scripts de desenvolvimento
- MCP servers disponíveis
- Convenções importantes específicas deste projeto
- Padrões de arquitetura a seguir
