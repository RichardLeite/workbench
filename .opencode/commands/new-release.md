---
description: "Release completa: pre-flight checks → wizard interativo → GitHub Release + Teams. Tudo automatizado."
---

# /new-release

> **Release com wizard interativo.** Cria GitHub Release com changelog gerado do Azure DevOps, a partir de um único comando.

## Quando usar

- `/new-release` | `/new-release v1.9.11` (pré-preencher tag)
- "criar release" | "nova tag" | "criar versão"
- Após release mergeada em `main` e antes de deploy em produção
- Para fechar uma sprint com release notes

## Pré-requisitos

- **TTY** (terminal interativo) — wizard usa `readline` nativo
- **`ADO_MCP_AUTH_TOKEN`** no `.env` (gerado em https://dev.azure.com/your-org/_usersSettings/tokens)
- **`gh` CLI** autenticado (`gh auth status`)
- **Working tree limpo** (`git status --porcelain` deve ser vazio)
- **Branch pushed** (sem commits ahead de `origin/<branch>`)

> Se algum pré-requisito falhar, o comando aborta e indica o que corrigir.

---

## Escopo

- **Tag**: SemVer `vMAJOR.MINOR.PATCH` (com sufixo opcional `-beta.N`, `-rc.N`)
- **Repositórios-alvo**: lidos dinamicamente de `.opencode/config/project-mapping.json`
- **Work items**: sprint do Azure DevOps (`Sprint Team`)

---

## Fluxo de Execução

```
/new-release
├── FASE 1 — Pre-flight Checks
├── FASE 2 — Wizard Interativo
│   └── (delega para create-release.js sem flags)
├── FASE 3 — Verificação
└── FASE 4 — Teams Notification (opcional, guard-rail)
```

---

### FASE 1: Pre-flight Checks

> Antes de invocar o wizard, validar contexto. **Falha em qualquer check = abortar com mensagem clara.**

#### 1.1 Working tree limpo
```bash
git status --porcelain
```
- **Vazio** → ✅ segue
- **Dirty** → perguntar: "Há mudanças não commitadas. Continuar mesmo assim? (s/N)"
  - Default = N. Se N, abortar.

#### 1.2 Push status
```bash
git log --oneline @{u}.. 2>/dev/null | head -10
```
- **Vazio** → ✅ todos os commits locais estão no remote
- **Ahead** → perguntar: "Há N commits não pushed. `git push` antes? (S/n)"
  - Default = S. Se sim, executar push e re-checar.

#### 1.3 Detectar projeto/repo
```bash
git remote get-url origin
```
Cruzar com `.opencode/config/project-mapping.json` (heurística já implementada em `create-release.js#detectProjectFromCwd`).

**Exibir:**
```
📦 Projeto detectado: Meu Projeto (meu-projeto)
📂 Repo: your-org/your-repo
```

Se não detectar → exibir todos os 18 projetos e seguir (wizard vai perguntar).

#### 1.4 Última tag + sugestão
```bash
git describe --tags --abbrev=0
```

**Exibir:**
```
🏷️  Última tag: v1.9.10
💡 Sugestão (patch +1): v1.9.11
```

> O wizard aceita editar essa sugestão livremente.

#### 1.5 Listar PRs mergeados desde a última tag (informativo)
```bash
gh pr list --state merged --search "merged:>YYYY-MM-DD" --json number,title,url --limit 20
```

> **Apenas exibe** — não bloqueia. O changelog detalhado vem do ADO no wizard.

---

### FASE 2: Wizard Interativo

> Delega para o wizard de `create-release.js` (criado no PR #99). 7 etapas com prompts amigáveis.

```bash
uv run --frozen python -m workbench release
```

**Etapas do wizard:**

| # | Pergunta | Origem da info |
|---|----------|---------------|
| 1 | 📦 Qual projeto? | `project-mapping.json` (18 projetos) |
| 2 | 📂 Qual repositório? | `repos.*` do projeto escolhido |
| 3 | 🏃 Qual sprint? | `listSprints()` do ADO (com `r` = refresh) |
| 4 | 🏷️ Tag da release? | Sugestão da FASE 1.4, editável |
| 5 | 🔍 Preview das notas | `generateReleaseNotes()` |
| 6 | ❓ Confirmação (s/N) | Default = N (segurança) |
| 7 | 🚀 Criar release | `gh release create` |

**Controles do wizard:**
- `número` + Enter → seleciona opção
- `r` → refresh (só na etapa de sprint)
- `q` → sair (em qualquer etapa, exit 130)
- `Ctrl+C` → cancela (exit 130)
- `Ctrl+D` (EOF) → cancela (exit 130)

> **Se o usuário passou tag como argumento** (`/new-release v1.9.11`), o wizard usa essa tag como default (mas ainda permite editar).

---

### FASE 3: Verificação

Após criar a release com sucesso:

```bash
gh release view <tag> --repo <org/repo>
```

**Exibir resumo:**
```
✅ Release criada: v1.9.11
📂 Repo: your-org/your-repo
🔗 URL: https://github.com/your-org/your-repo/releases/tag/v1.9.11
📊 Work items: 14 pais, 119 total
```

Se falhar → mostrar erro detalhado e o caminho do arquivo de notas (`tmp/release-notes-<tag>.md`) para debug.

---

### FASE 4: Teams Notification (opcional, com guard-rail)

> ⚠️ **Teams Guard-Rail** (Constitution, regra 11): nunca enviar mensagem sem aprovação explícita do usuário.

Após sucesso, perguntar:

```
📣 Notificar o squad no Teams sobre a release? (s/N)
```

- **Default = N** (não notificar)
- Se sim → delegar para skill `teams-pr` com:
  - Título: `🚀 RELEASE [<tag>](<url>) — <projeto>`
  - Corpo: projeto, repo, tag, URL, contagem de work items, top 3 PBIs
  - Revisor: ninguém (release não tem revisor — usar `@channel` ou omitir)

> O guard-rail garante que a notificação **só sai com clique duplo** do usuário.

---

## Relatório Final

### RELEASE v1.9.11 — Relatório Final

| Etapa                          | Status                                              |
| ------------------------------ | --------------------------------------------------- |
| **FASE 1** — Pre-flight        | ✅/❌ (working tree, push, projeto, tag)            |
| **FASE 2** — Wizard            | ✅/❌ (7 etapas concluídas)                          |
| **FASE 3** — Verificação       | ✅/❌ (release visível no GitHub)                    |
| **FASE 4** — Teams (opcional)  | ✅/❌ (apenas se usuário aprovou)                    |

| Item              | Valor                                                       |
| ----------------- | ----------------------------------------------------------- |
| **Tag**           | v1.9.11                                                     |
| **Repo**          | your-org/your-repo                                |
| **Sprint**        | Sprint 08 - Reforma Trib (Parte 02)                         |
| **Work items**    | 14 pais, 119 total                                          |
| **URL da release**| https://github.com/your-org/your-repo/releases/tag/v1.9.11 |

---

## Variáveis

| Variável          | Exemplo                              | Descrição                          |
| ----------------- | ------------------------------------ | ---------------------------------- |
| `vX.Y.Z`          | `v1.9.11`                            | Tag SemVer da release              |
| `--tag <versão>`  | `--tag v2.0.0`                       | Pré-preencher tag (opcional)       |
| `--repo <path>`   | `--repo your-org/your-repo`| Pré-preencher repo (opcional)      |

> Argumentos extras são passados para o `create-release.js` no modo CLI (não-wizard).

---

## Observações

- **Modo interativo (wizard)** só funciona em TTY. Em CI/pipes, use `uv run --frozen python -m workbench release --sprint "..." --repo "..." --tag v...`
- **Detecção de projeto** via `git remote get-url origin` — se o remote não casar, wizard lista todos
- **Conventional Commits** desde a última tag ajudam a sugerir minor vs patch
- **Para `.workbench`**, o repo é sempre `/.workbench` (caso especial)
- **Rollback** de release: `gh release delete v1.9.11 --repo <org/repo> --yes` (apaga release, mantém tag)
- **Rollback de tag**: `git push --delete origin v1.9.11 && git tag -d v1.9.11`

---

## Veja também

- [`.opencode/scripts/create-release.js`](../../scripts/create-release.js) — script subjacente
- [`.opencode/config/project-mapping.json`](../../config/project-mapping.json) — catálogo de projetos
- [`/git-sprint`](git-sprint.md) — fluxo de sprint (cria PR, não release)
- [`/git-hotfix`](git-hotfix.md) — fluxo de hotfix (cria PR, não release)
