# PR-CONFIG — Central de Configuração de Pull Requests

> Fonte única para regras de branch, título, corpo de PR, revisão e convenções de
> commit. Vale para o workbench e para todos os projetos gerenciados.

## Sumário

1. [BRANCH RULES](#1-branch-rules)
2. [PR TITLE FORMAT](#2-pr-title-format)
3. [PR BODY TEMPLATE](#3-pr-body-template)
4. [REVIEWER RULES](#4-reviewer-rules)
5. [REPO MAPPING](#5-repo-mapping)
6. [VALIDATION RULES](#6-validation-rules)
10. [CONVENTIONAL COMMITS](#10-conventional-commits)
11. [CONVENTIONAL BRANCHES](#11-conventional-branches)

---

## 1. BRANCH RULES

### 1.1 Fluxo

| Tipo | Branch de origem | Branch de destino |
|------|------------------|-------------------|
| Sprint / feature | `main` (ou `release`, se o projeto usar) | `main` |
| Hotfix | `main` | `main` |
| Hotfix em release | `release` | `release` |
| Workbench | `main` | `main` |

Projetos que usam `release` devem declarar isso no `AGENTS.md` do projeto.

### 1.2 Regras

- Nunca commitar diretamente em `main` ou `release`.
- Branch criada a partir da base correta, com nome descritivo.
- Um PR = uma intenção. Evite misturar refactor e feature.
- Hotfix: escopo mínimo, sem refactor paralelo.
- Todo PR precisa de rollback descrito.

---

## 2. PR TITLE FORMAT

```
[TASK-XXXX] Descrição curta em inglês
```

- Workbench não usa prefixo de task: `feat(workbench): descrição`.
- Projetos podem usar o identificador do seu tracker (`TASK-`, `AB#`, `#123`).
- Título em inglês; descrição livre no corpo.

---

## 3. PR BODY TEMPLATE

```markdown
## O que mudou?

### {NOME_DA_FEATURE}

- ...

## Por quê?

...

## Evidências

### Testes

- [ ] ...

### Exemplo de execução (se aplicável)

```bash
...
```

## Possíveis riscos

...

## Rollback

...

## Commits

- `type(scope): description`

## Checklist

- [ ] Testes adicionados/atualizados
- [ ] Documentação/backlog atualizados
- [ ] Sem secrets no diff
- [ ] Rollback descrito
```

---

## 4. REVIEWER RULES

Arquivo fonte: `.opencode/config/eligible-reviewers.json`.

Campos por revisor:
- `name` — nome de exibição
- `email` — contato (opcional; usado por adapters de notificação)
- `github` — username GitHub (para adicionar como reviewer)
- `seniority` — `senior` / `pleno` / `junior`
- `weightMultiplier` — peso no sorteio
- `active` — `true` / `false`

Regras:
- Autor do PR nunca é revisor.
- O sorteio é opcional e usa `uv run --frozen python -m workbench reviewers sort`.
- Se um revisor não tiver `github`, apenas exiba um aviso.
- Se falhar em um PR, continue com os demais.

---

## 5. REPO MAPPING

Os repositórios vêm de `project-mapping.json#projects.<slug>.repos`. Não
duplique tabelas de repositório neste arquivo.

Exemplo de resolução:

```bash
uv run --frozen python -m workbench repo resolve --project <slug>
```

---

## 6. VALIDATION RULES

- Validar título e corpo do PR antes de abrir/atualizar.
- Scripts disponíveis:
  - `uv run --frozen python -m workbench validate branch <branch>`
  - `uv run --frozen python -m workbench validate pr <pr-number> --owner <org> --repo <repo>`
  - `uv run --frozen python -m workbench validate spec <spec.md>`
- Falha de validação = corrigir antes de prosseguir; nunca bypass.

---

## 10. CONVENTIONAL COMMITS

Formato:

```
type(scope): description
```

Tipos: `feat`, `fix`, `test`, `chore`, `docs`, `refactor`, `perf`.

Regras:
- Descrição no imperativo, curta, em inglês.
- Escopo opcional, mas recomendado (`workbench`, módulo, camada).
- Um commit por intenção lógica.
- Nunca `--no-verify`, nunca `--force`.

---

## 11. CONVENTIONAL BRANCHES

Padrão:

```
type/short-description
```

Tipos: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `perf`.

Exemplos:

```
feat/customer-import
fix/token-expiry
docs/onboarding
```

Regras:
- kebab-case, sem espaços.
- Branch de trabalho nunca é `main`/`release`.
- Delete a branch após o merge.

---

## Histórico de Versões

| Data | Versão | Mudança |
|------|--------|---------|
| 2026-10-29 | 3.0 | Versão genérica independente de empresa; removidas seções específicas de Teams/ADO/squads. |
