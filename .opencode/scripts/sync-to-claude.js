#!/usr/bin/env node
// sync-to-claude.js — Bridge OpenCode → Claude Code
//
// Gera a camada .claude/ a partir da fonte da verdade (.opencode/ + opencode.json).
// Executar da raiz do .workbench:  node .opencode/scripts/sync-to-claude.js
//
// O que gera (DERIVADO — não editar à mão, editar a fonte em .opencode/):
//   - .claude/agents/*.md      ← opencode.json `agent` + prompts referenciados
//   - .mcp.json                ← opencode.json `mcp`
//   - .claude/settings.json    ← opencode.json `permission` + env
// O que cria (symlink local, gitignored — recriado por máquina):
//   - .claude/skills   → ../.opencode/skills
//   - .claude/commands → ../.opencode/commands
//
// Escrito à mão (NÃO tocado por este script): CLAUDE.md, CLAUDE_BRIDGE.md

const fs = require('fs');
const path = require('path');

const WORKBENCH = path.resolve(__dirname, '../..');
const OPENCODE_JSON = path.join(WORKBENCH, 'opencode.json');
const CLAUDE_DIR = path.join(WORKBENCH, '.claude');
const CLAUDE_AGENTS = path.join(CLAUDE_DIR, 'agents');

// ── Model tiering (Claude) ────────────────────────────────────────────────
// opus  = raciocínio/review/decisão pesados | haiku = rápido/mecânico | sonnet = default
const OPUS = new Set(['orquestrador']);
const HAIKU = new Set([
  'explore', 'explorador', 'pedreiro', 'revisor', 'code-reviewer',
  'image-analyzer', 'ux-analyzer', 'integracoes-power', 'business-analyst',
]);
const DEFAULT_MODEL = 'sonnet';
function modelFor(name) {
  if (OPUS.has(name)) return 'opus';
  if (HAIKU.has(name)) return 'haiku';
  return DEFAULT_MODEL;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseFrontmatter(txt) {
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, body: txt };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (mm) fm[mm[1]] = mm[2].replace(/^["']|["']$/g, '').trim();
  }
  return { fm, body: txt.slice(m[0].length) };
}

// Deriva a lista `tools` do Claude a partir da permissão do OpenCode.
// Agentes read-only (write:deny + edit:deny) recebem lista restrita.
// Agentes com escrita herdam todas as tools (omitimos o campo `tools`).
function toolsFor(cfg) {
  const p = cfg.permission || {};
  const readonly = p.write === 'deny' && p.edit === 'deny';
  if (!readonly) return null; // herda todas (Read/Write/Edit/Bash/Task/...)
  const t = ['Read', 'Grep', 'Glob'];
  if (p.bash !== 'deny') t.push('Bash');
  const keys = Object.keys(p);
  if (keys.some((k) => k.startsWith('mcp-image'))) t.push('mcp__mcp-image');
  if (keys.some((k) => k.startsWith('azure-devops'))) t.push('mcp__azure-devops');
  if (keys.some((k) => k.startsWith('teams-graph'))) t.push('mcp__teams-graph');
  return t;
}

function promptPath(promptRef) {
  // "{file:./.opencode/agents/core/orquestrador.md}" → absolute path
  const m = String(promptRef || '').match(/\{file:(.+?)\}/);
  if (!m) return null;
  return path.resolve(WORKBENCH, m[1].replace(/^\.\//, ''));
}

const HEADER = (src) =>
  `<!-- AUTO-GERADO por .opencode/scripts/sync-to-claude.js — NÃO editar à mão.\n` +
  `     Fonte: ${src}. Rode o sync após alterar a fonte. -->\n\n`;

// ── 1. Agentes ───────────────────────────────────────────────────────────
function genAgents(cfg) {
  fs.mkdirSync(CLAUDE_AGENTS, { recursive: true });
  const agents = cfg.agent || {};
  let ok = 0, skipped = 0;
  for (const [key, a] of Object.entries(agents)) {
    const pfile = promptPath(a.prompt);
    if (!pfile || !fs.existsSync(pfile)) {
      console.warn(`   ⚠️  ${key}: prompt não encontrado (${a.prompt})`);
      skipped++;
      continue;
    }
    const raw = fs.readFileSync(pfile, 'utf-8');
    const { fm, body } = parseFrontmatter(raw);
    const name = slug(fm.name || key);
    const model = modelFor(name);
    const tools = toolsFor(a);

    let front = `---\nname: ${name}\n`;
    front += `description: ${a.description || fm.description || name}\n`;
    if (tools) front += `tools: ${tools.join(', ')}\n`;
    front += `model: ${model}\n---\n\n`;

    const relSrc = path.relative(WORKBENCH, pfile).replace(/\\/g, '/');
    fs.writeFileSync(
      path.join(CLAUDE_AGENTS, `${name}.md`),
      front + HEADER(relSrc) + body.trimStart(),
      'utf-8'
    );
    ok++;
  }
  console.log(`   Agents: ${ok} gerados, ${skipped} pulados`);
}

// ── 2. .mcp.json ───────────────────────────────────────────────────────────
function genMcp(cfg) {
  const src = cfg.mcp || {};
  const mcpServers = {};
  for (const [name, m] of Object.entries(src)) {
    if (m.enabled === false) continue;
    const [command, ...args] = m.command || [];
    const entry = { command, args };
    if (m.env) entry.env = m.env;
    mcpServers[name] = entry;
  }
  fs.writeFileSync(
    path.join(WORKBENCH, '.mcp.json'),
    JSON.stringify({ mcpServers }, null, 2) + '\n',
    'utf-8'
  );
  console.log(`   .mcp.json: ${Object.keys(mcpServers).length} servidores`);
}

// ── 3. .claude/settings.json ────────────────────────────────────────────────
function genSettings(cfg) {
  // Traduz o bloco permission do OpenCode para o formato do Claude Code.
  // Sintaxe de regra Bash: `Bash(cmd)` exato · `Bash(prefixo:*)` com `:*` SEMPRE no fim
  // · `*` no meio = wildcard. `Bash(git push:* main)` é inválido (`:*` fora do fim) e o
  // Claude Code descarta a regra silenciosamente. Cada branch protegida leva 2 padrões:
  //   `git push * main`      → forma simples (git push origin main)
  //   `git push origin main:*` → com flags no fim (git push origin main --tags)
  // Cobertura parcial e conhecida: `git push` puro (branch com upstream) e
  // `git push origin HEAD` não casam — o hook PreToolUse abaixo é a rede real.
  const ask = [
    'Bash(git push --force:*)',
    'Bash(git push -f:*)',
    'Bash(git push --force-with-lease:*)',
    'Bash(git push * main)',
    'Bash(git push origin main:*)',
    'Bash(git push * release)',
    'Bash(git push origin release:*)',
    'Bash(git push * develop)',
    'Bash(git push origin develop:*)',
    'Bash(git push --delete:*)',
    'Bash(git push -d:*)',
    'Bash(git merge:*)',
    'Bash(git rebase:*)',
    'Bash(git revert:*)',
    'Bash(git reset:*)',
    'Bash(git branch -D:*)',
  ];
  // NÃO adicionar `Bash(git commit ... main)` aqui: `git commit` não recebe a branch
  // como argumento, então nenhum padrão de permissão casa com "commit em main".
  // Isso é responsabilidade do hook PreToolUse (hooks.PreToolUse abaixo).
  const deny = [
    'Read(./.env)',
    'Read(./**/.env)',
  ];
  // Bloqueia commit em main/release checando a branch atual. Invocado via `bash <script>`
  // para não depender de bit de execução (repo montado em /mnt/f, sem permissão POSIX).
  const hooks = {
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [
          {
            type: 'command',
            command: 'bash "$CLAUDE_PROJECT_DIR/.opencode/hooks/block-protected-commit.sh"',
          },
        ],
      },
    ],
  };
  const settings = {
    $schema: 'https://json.schemastore.org/claude-code-settings.json',
    permissions: { ask, deny, defaultMode: 'acceptEdits' },
    hooks,
    enableAllProjectMcpServers: true,
  };
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(CLAUDE_DIR, 'settings.json'),
    JSON.stringify(settings, null, 2) + '\n',
    'utf-8'
  );
  console.log(
    `   settings.json: ${ask.length} ask, ${deny.length} deny, ` +
      `${hooks.PreToolUse.length} PreToolUse hook(s)`
  );
}

// ── 4. Symlinks skills/commands (gitignored, por máquina) ─────────────────────
function linkDir(name) {
  const win = process.platform === 'win32';
  // Windows: junction (aponta p/ path absoluto, não exige admin). POSIX: symlink relativo.
  const target = win
    ? path.join(WORKBENCH, '.opencode', name)
    : path.join('..', '.opencode', name); // relativo a .claude/
  const link = path.join(CLAUDE_DIR, name);

  // Idempotente e não-destrutivo: se o caminho já resolve p/ diretório usável
  // (symlink válido OU cópia), mantém. Para forçar refresh, apague .claude/<name> antes.
  // (statSync segue o link; evita a interop instável de isSymbolicLink no node do Windows.)
  try {
    if (fs.statSync(link).isDirectory()) {
      console.log(`   ok: .claude/${name} já presente`);
      return;
    }
  } catch (_) { /* não existe ou link quebrado → (re)criar abaixo */ }
  // Link quebrado / arquivo solto: remover apenas a entrada (nunca o target).
  try { fs.unlinkSync(link); } catch (_) { /* nada a remover */ }
  try {
    fs.symlinkSync(target, link, win ? 'junction' : undefined);
    console.log(`   ${win ? 'junction' : 'symlink'}: .claude/${name} → .opencode/${name}`);
  } catch (e) {
    console.warn(`   ⚠️  link .claude/${name} falhou (${e.code}). Fallback: cópia.`);
    try { copyDir(path.join(WORKBENCH, '.opencode', name), link); }
    catch (e2) { console.warn(`   ⚠️  cópia .claude/${name} falhou (${e2.code}). Crie o link à mão.`); }
  }
}
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
console.log('🔁 OpenCode → Claude Code Sync');
console.log(`   Workbench: ${WORKBENCH}\n`);
const cfg = JSON.parse(fs.readFileSync(OPENCODE_JSON, 'utf-8'));
genAgents(cfg);
genMcp(cfg);
genSettings(cfg);
linkDir('skills');
linkDir('commands');
console.log('\n✅ Claude Code pronto. Reinicie o Claude Code para carregar agents/MCP.');
