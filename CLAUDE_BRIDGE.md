# Claude Code Bridge — Como o `.workbench` roda no Claude Code

> Ponte OpenCode → Claude Code. Análogo ao @CODEX_BRIDGE.md.
> Fonte da verdade = `.opencode/`. A camada `.claude/` é **derivada** e regenerável.

---

## Modelo mental

O `.workbench` mantém **uma** fonte da verdade (`.opencode/`) e projeta camadas por ferramenta:

| Ferramenta | Config | Agentes | Skills/Commands |
|-----------|--------|---------|-----------------|
| **OpenCode** (nativo) | `opencode.json` | `.opencode/agents/**/*.md` | `.opencode/{skills,commands}/` |
| **Codex CLI** | `.codex-plugin/`, `AGENTS.md` | `.codex/agents/*.toml` | compartilha `.opencode/skills` |
| **Claude Code** | `.mcp.json`, `.claude/settings.json`, `CLAUDE.md` | `.claude/agents/*.md` (gerado) | `.claude/{skills,commands}` → symlink p/ `.opencode/` |

## Setup (após clonar o `.workbench`)

```bash
# 1. Gerar/atualizar a camada .claude/ a partir de .opencode/
node .opencode/scripts/sync-to-claude.js      # ou: npm run sync:claude

# 2. Configurar MCPs (uma vez)
cp .env.example .env    # preencher credenciais
npx @floriscornel/teams-mcp@0.9.0 authenticate

# 3. Abrir o Claude Code na raiz do .workbench
claude
```

O sync gera **34 agentes**, `.mcp.json` (4 servidores) e `.claude/settings.json`,
e cria os symlinks `skills`/`commands`. Reinicie o Claude Code para carregar.

### WSL: `node` precisa estar no PATH

O `.mcp.json` lança cada servidor com `command: node`. No **WSL**, se o `node` não
estiver no PATH (cenário comum quando o Node está instalado só no Windows, via nvm4w),
o Claude Code não consegue subir nenhum MCP — e **nenhuma ferramenta `mcp__*` aparece
na sessão**, sem erro visível. (No OpenCode/Windows nativo o `node` resolve normal.)

Correção — exponha um Node ≥ 22 no PATH do WSL. Reusar o Node do Windows via symlink
funciona (o interop executa o `.exe`):

```bash
# Ajuste o caminho para a sua versão instalada (>= 22). Ex.: nvm4w em /mnt/c/ProgramData/nvm
ln -sf /mnt/c/ProgramData/nvm/v25.9.0/node.exe ~/.local/bin/node
ln -sf /mnt/c/ProgramData/nvm/v25.9.0/npm      ~/.local/bin/npm
node --version   # deve imprimir v22+  (~/.local/bin já costuma estar no PATH)
```

Depois **reinicie o Claude Code** — os 4 MCPs conectam sozinhos.

> ⚠️ O `node.exe` do Windows não entende caminho WSL absoluto (`/mnt/f/...`). Como o
> `.mcp.json` usa arg **relativo** com cwd na raiz do `.workbench`, o interop traduz o
> cwd para `F:\...` e resolve corretamente — não altere os args para caminhos absolutos.

## O que o sync gera (NÃO editar à mão — editar a fonte em `.opencode/`)

| Saída | Fonte | Regra |
|-------|-------|-------|
| `.claude/agents/*.md` | `opencode.json` `agent` + prompt referenciado | frontmatter Claude (`name`, `description`, `tools`, `model`) + corpo do prompt |
| `.mcp.json` | `opencode.json` `mcp` | `command`/`args`/`env` |
| `.claude/settings.json` | `opencode.json` `permission` | `permissions.ask/deny` |
| `.claude/skills` | symlink → `.opencode/skills` | gitignored (recriado por máquina) |
| `.claude/commands` | symlink → `.opencode/commands` | gitignored (recriado por máquina) |

## Mapeamento de conversão

### Agentes (OpenCode `.md` → Claude `.md`)

| OpenCode | Claude Code |
|----------|-------------|
| `name` (frontmatter/chave) | `name` (slug kebab-case) |
| `description` | `description` |
| `permission: {write, edit, bash}` | `tools` (só p/ read-only: `Read, Grep, Glob[, Bash]`; agentes de escrita herdam todas) |
| `permission: {mcp-*}` (read-only) | acrescenta `mcp__<server>` em `tools` |
| `mode: primary` | não há "primary" no Claude → orquestrador vive no `CLAUDE.md`; agente também é delegável via `Task` |
| tier (Codex `model`/`effort`) | `model`: `opus` (review/decisão) · `haiku` (explore/pedreiro) · `sonnet` (default) |
| corpo (após frontmatter) | corpo do agente Claude |

### Model tiering (Claude)

- **opus**: orquestrador
- **haiku**: explore, explorador, pedreiro, revisor, code-reviewer, image-analyzer, ux-analyzer, integracoes-power
- **sonnet**: todos os demais (default)

### MCP servers (`.mcp.json`)

`mcp-image` (ativo) · `mysql` · `azure-devops` · `teams-graph` (usa `TEAMS_MCP_CLIENT_ID` do `.env`; adapters opcionais).
Nomes de tools no Claude: `mcp__<server>__<tool>` (ex.: `mcp__azure-devops__wit_get_work_item`).

## Skills & Commands

Formato `SKILL.md` (frontmatter `name`/`description`) e commands (frontmatter `description`
+ `$ARGUMENTS`/`@file`/`` !`cmd` ``) são compatíveis entre OpenCode e Claude Code — por isso
são **symlinkados**, sem conversão. Ajustes específicos do Claude, se necessários, devem ir na
fonte `.opencode/` (compartilhada) ou via override futuro.

## Guard-rails no Claude

- `permissions.deny` bloqueia leitura de `.env` e commit direto em `main`/`release`.
- `permissions.ask` exige confirmação para `push --force`, push/commit em branches protegidas, `merge`, `rebase`, `reset`, `revert`, `branch -D`.
- Notificações externas: nenhuma mensagem enviada sem aprovação explícita (STEP de aprovação nas skills).

## Manutenção

Sempre que alterar algo em `.opencode/` (agentes, MCP, permissões), rode:

```bash
npm run sync:claude     # regenera .claude/agents, .mcp.json, settings.json, symlinks
```

Sincronize também as outras camadas quando fizer sentido: `npm run sync:codex`.
