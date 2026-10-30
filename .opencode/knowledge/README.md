# Knowledge Base — Mapa de Paths (Multi-Project)

> Documentação centralizada de onde cada artefato é salvo, por contexto.
> Todo comando que cria ou lê specs/features/bugs deve seguir este mapa.
>
> **Multi-Project:** o workbench descobre projetos automaticamente e
> mescla o catálogo base com o local. Veja [multi-project-architecture.md](multi-project-architecture.md).

## Estrutura

```
.opencode/knowledge/            ← Contexto .workbench (infra + meta-projeto)
├── features/                   ← Feature specs de negócio
├── specs/                      ← Specs técnicas executáveis
├── bugs/                       ← Bug specs
├── decisions/                  ← ADRs
├── plans/                      ← Checkpoints de execução (EFÊMERO — no .gitignore)
├── metrics/                    ← Dados de delegação e métricas
└── multi-project-architecture.md  ← Arquitetura multi-project

projects/<slug>/knowledge/      ← Contexto de cada projeto
├── backlog/
│   ├── features/
│   ├── bugs/
│   ├── 00-backlog.md
│   ├── 01-tech-debt.md
│   ├── 02-bugs.md
│   └── 03-prioritization.md
├── specs/
└── decisions/
```

> **Nota:** O workbench é o meta-projeto e seu conhecimento fica em `.opencode/knowledge/`.
> Para projetos específicos, o conhecimento fica em `projects/<slug>/knowledge/`.
> Todos os paths são resolvidos dinamicamente via catálogo mesclado.

## Mapa por tipo de artefato

| Artefato | Contexto <projeto> | Contexto .workbench |
|----------|--------------------|---------------------|
| **Feature (negócio)** | `projects/<slug>/knowledge/backlog/features/<slug>.md` | `.opencode/knowledge/features/<slug>.md` |
| **Spec técnica** | `projects/<slug>/knowledge/specs/spec-<slug>.md` | `.opencode/knowledge/specs/spec-<slug>.md` |
| **Bug spec** | `projects/<slug>/knowledge/backlog/bugs/<WI-ID>-<slug>.md` | `.opencode/knowledge/bugs/<slug>.md` |
| **ADR** | `projects/<slug>/knowledge/decisions/ADR-XXX-<slug>.md` | `.opencode/knowledge/decisions/ADR-XXX-<slug>.md` |
| **Checkpoint** | `projects/<slug>/knowledge/plans/checkpoint-<slug>.json` | `.opencode/knowledge/plans/checkpoint-<slug>.json` |

## Templates

| Template | Localização |
|----------|-------------|
| Feature (negócio) | `.opencode/templates/feature-template.md` |
| Spec técnica | `.opencode/templates/spec-template.md` |
| Bug | `.opencode/templates/bug-template.md` |
| ADR | `.opencode/templates/adr-template.md` |

## Comandos que criam/lêem artefatos

| Comando | O que cria/lê | Paths |
|---------|--------------|-------|
| `/refinar` | Entrevista → roteia para `/new-feature` ou `/new-bug` | Entrevista → template |
| `/new-feature` | Feature + Spec técnica | Mapa acima |
| `/new-bug` | Bug spec | Mapa acima |
| `/new-adr` | ADR | `decisions/` ou `.opencode/knowledge/adr/` |
| `/process` | Processo + artefatos do projeto | Mapa acima + checkpoints |
| `/execute-spec` | Executa spec → checkpoints | Spec em `<spec_path>`, checkpoints em `<project_checkpoint_path>` |

## Regras

1. **Contexto primeiro** — identificar se é um projeto descoberto ou `.workbench` antes de decidir o path
2. **Checkpoints são efêmeros** — o diretório `plans/` está no `.gitignore`
3. **Consistência** — todo novo comando de spec deve seguir este mapa
4. **Atualização** — se um novo contexto de projeto for adicionado, este mapa deve ser atualizado
