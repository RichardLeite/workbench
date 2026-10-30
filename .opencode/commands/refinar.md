---
description: "Dispatcher de refinamento: source → entrevista (task-refiner) → new-bug/new-feature/new-adr → vault-updater"
---

# /refinar

Dispatcher: entrevista via skill `task-refiner`, geração delegada aos comandos especializados.

## Quando usar

- `/refinar <numero>` → issue do GitHub
- `/refinar <path>` → spec existente
- `/refinar <texto>` → descrição avulsa
- `/refinar` → pergunta
- "preciso refinar essa task" → contexto atual

## Fluxo

### FASE 1 — Source

Analisar `$ARGUMENTS`:

- **Número** → `gh issue view <numero> --json title,body` (se `gh` estiver disponível)
- **Link** → extrair título/descrição da issue ou página
- **Path** → `read` tool → extrai conteúdo
- **Texto** → usar direto
- **Vazio** → perguntar

### FASE 2 — Entrevista (skill task-refiner)

Carregar `@.opencode/skills/task-refiner` com
`{ source_type, source_title, source_description, source_id }`.

Retorna JSON com:
- `detected_artifact.type` (`bug|feature|adr|plan|spec|custom`)
- `detected_artifact.command_target` (`/new-bug|/new-feature-spec|/new-adr|null`)
- `interview` (respostas nomeadas)
- `tech_findings` (descobertas do codebase)

Salvar como `$INTERVIEW_DATA`.

### FASE 3 — Roteamento

| Tipo | Ação |
|------|------|
| `bug` | `/new-bug` |
| `feature` | `/new-feature-spec` |
| `adr` | `/new-adr` |
| `plan` | template de plano |
| `spec` | `spec-template.md` |
| `custom` | perguntar formato ao usuário |

### FASE 4 — Vault

Delegar ao `vault-updater` quando o projeto tiver vault configurado.

### FASE 5 — Resultado

Retornar os artefatos criados e os próximos passos.
