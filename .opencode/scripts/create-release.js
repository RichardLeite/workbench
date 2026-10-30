#!/usr/bin/env node
/**
 * create-release.js
 *
 * Cria GitHub Release com changelog gerado a partir de uma Sprint do Azure DevOps.
 *
 * Fluxo:
 *   1. Usuário informa qual sprint (ou usa --sprint)
 *   2. Busca todos os work items da sprint via API do ADO
 *   3. Busca tags do git para associar PRs/commits
 *   4. Gera release notes agrupadas por tipo (Bug, Feature, PBI, Task)
 *   5. Cria GitHub Release via gh CLI
 *
 * Em modo CLI, --sprint e --repo são obrigatórios. --repo pode ser
 * auto-detectado via `git remote get-url origin` se omitido, mas se a
 * detecção falhar o script aborta com erro pedindo --repo explícito.
 *
 * Uso:
 *   node .opencode/scripts/create-release.js                       # Modo interativo (wizard, requer TTY)
 *   node .opencode/scripts/create-release.js --sprint "Sprint 42"  # Modo CLI
 *   node .opencode/scripts/create-release.js --sprint "Sprint 42" --tag v1.9.10
 *   node .opencode/scripts/create-release.js --sprint "Sprint 42" --preview
 *   node .opencode/scripts/create-release.js --sprint "Sprint 42" --repo your-org/your-repo
 *   node .opencode/scripts/create-release.js --list-sprints         # Lista sprints disponíveis
 *
 * Modo interativo (wizard): ativado automaticamente quando o script é
 * invocado SEM nenhuma flag E COM TTY disponível (process.stdin.isTTY &&
 * process.stdout.isTTY). Em modo não-TTY (pipes, CI, < /dev/null), o script
 * cai no modo CLI e exige --sprint.
 *
 * Saída: JSON no stdout.
 * Exit code: 0 = sucesso, 1 = erro, 130 = cancelado pelo usuário (Ctrl+C)
 */

const https = require('https');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// ─── Config ───────────────────────────────────────────────────────────────
const ENV_PATH = path.join(__dirname, '..', '..', '.env');
const ADO_ORG = process.env.ADO_ORG || process.env.AZURE_DEVOPS_ORG || '';
const ADO_PROJECT = process.env.ADO_PROJECT || '';
const ADO_TEAM = process.env.ADO_TEAM || '';
const GITHUB_ORG = process.env.GITHUB_ORG || process.env.GITHUB_OWNER || '';

const WI_TYPE_EMOJI = {
  'Bug': '🐛',
  'Feature': '✨',
  'Product Backlog Item': '📋',
  'PBI': '📋',
  'Task': '🔧',
  'User Story': '📖',
  'Issue': '⚠️',
  'Epic': '🏗️',
};

const WI_TYPE_ORDER = ['Epic', 'Feature', 'Product Backlog Item', 'PBI', 'User Story', 'Bug', 'Task', 'Issue'];

// ─── Helpers ──────────────────────────────────────────────────────────────

function getAdoToken() {
  // Try env var first, then .env file
  if (process.env.ADO_MCP_AUTH_TOKEN) return process.env.ADO_MCP_AUTH_TOKEN;

  try {
    if (fs.existsSync(ENV_PATH)) {
      const env = fs.readFileSync(ENV_PATH, 'utf-8');
      const match = env.match(/^ADO_MCP_AUTH_TOKEN=(.+)$/m);
      if (match) return match[1].trim();
    }
  } catch {}

  return null;
}

function adoRequest(apiPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const token = getAdoToken();
    if (!token) {
      reject(new Error('ADO_MCP_AUTH_TOKEN não encontrado no .env'));
      return;
    }

    const auth = Buffer.from(`:${token}`).toString('base64');
    const encodedProject = encodeURIComponent(ADO_PROJECT);
    const encodedTeam = encodeURIComponent(ADO_TEAM);
    const separator = apiPath.includes('?') ? '&' : '?';

    // Routes: some are team-scoped, some are project-scoped
    let urlStr;
    if (apiPath.startsWith('/work/teamsettings') || apiPath.startsWith('/wit/wiql')) {
      urlStr = `https://dev.azure.com/${ADO_ORG}/${encodedProject}/${encodedTeam}/_apis${apiPath}${separator}api-version=7.0`;
    } else {
      urlStr = `https://dev.azure.com/${ADO_ORG}/${encodedProject}/_apis${apiPath}${separator}api-version=7.0`;
    }

    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Falha ao parsear resposta ADO (status ${res.statusCode}): ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('Timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function run(cmd, options = {}) {
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      cwd: options.cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
      env: { ...process.env, GITHUB_TOKEN: '' }, // avoid invalid GITHUB_TOKEN
    });
    return stdout.trim();
  } catch (e) {
    if (options.silent) return '';
    throw new Error(`Command failed: ${cmd}\n${e.stderr || e.message}`);
  }
}

function getCurrentRepo() {
  try {
    const remote = run('git remote get-url origin', { silent: true });
    if (!remote) return null;
    const match = remote.match(/(?:github\.com[/:])([\w-]+\/[\w-]+?)(?:\.git)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getLastTag() {
  try {
    return run('git describe --tags --abbrev=0 2>nul', { silent: true });
  } catch {
    return null;
  }
}

function getCommitsSinceTag(tag) {
  const range = tag ? `${tag}..HEAD` : '--all';
  const log = run(`git log --oneline --no-merges ${range}`, { silent: true });
  if (!log) return [];
  return log.split('\n').filter(Boolean).map(line => {
    const match = line.match(/^([a-f0-9]+)\s+(.+)$/);
    return match ? { hash: match[1], message: match[2] } : { hash: '', message: line };
  });
}

function extractTaskIds(commits) {
  const ids = new Set();
  for (const c of commits) {
    const match = c.message.match(/(TASK[-\s]?\d+|AB#?\d+)/i);
    if (match) ids.add(match[1].replace(/\s/, '-').toUpperCase());
  }
  return [...ids];
}

function extractPrNumber(message) {
  const match = message.match(/\(#(\d+)\)/);
  return match ? match[1] : null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── ADO API Calls ────────────────────────────────────────────────────────

async function listSprints() {
  const data = await adoRequest(`/work/teamsettings/iterations`);
  if (!data.value) return [];

  return data.value.map(i => ({
    id: i.id,
    name: i.name,
    path: i.path || null,
    timeFrame: i.attributes ? i.attributes.timeFrame : null,
    startDate: i.attributes ? i.attributes.startDate : null,
    finishDate: i.attributes ? i.attributes.finishDate : null,
  }));
}

async function findSprint(sprintName) {
  const sprints = await listSprints();
  const normalized = sprintName.toLowerCase().trim();

  // Exact match first
  let found = sprints.find(s => s.name.toLowerCase() === normalized);
  if (found) return { ...found, all: sprints };

  // Partial match
  found = sprints.find(s => s.name.toLowerCase().includes(normalized));
  if (found) return { ...found, all: sprints };

  // Try with "Sprint Team\" prefix
  found = sprints.find(s => s.path?.toLowerCase().includes(normalized));
  if (found) return { ...found, all: sprints };

  return { all: sprints };
}

async function getWorkItemsFromSprint(sprintId) {
  // Get all work items in the sprint (use iteration GUID, not path)
  const data = await adoRequest(`/work/teamsettings/iterations/${sprintId}/workitems`);
  if (!data.workItemRelations || data.workItemRelations.length === 0) return [];

  // Extract unique work item IDs
  const ids = [...new Set(data.workItemRelations.map(r => r.target ? r.target.id : null).filter(Boolean))];

  if (ids.length === 0) return [];

  // Batch query to get work item details (max 200 per request)
  const details = [];
  const batchSize = 200;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const fields = 'System.Id,System.Title,System.WorkItemType,System.State,System.Parent,System.Tags';
    const detailData = await adoRequest(`/wit/workitems?ids=${batch.join(',')}&fields=${fields}`);
    if (detailData.value) {
      details.push(...detailData.value);
    }
    await sleep(100); // Rate limiting
  }

  return details;
}

async function getWorkItemDetails(workItemId) {
  const data = await adoRequest(`/wit/workitems/${workItemId}?fields=System.Id,System.Title,System.WorkItemType,System.State,System.Parent,System.Tags`);
  return data;
}

// ─── Release Notes Generation ─────────────────────────────────────────────

function groupWorkItems(workItems) {
  const groups = {};

  for (const wi of workItems) {
    const type = wi.fields['System.WorkItemType'] || 'Task';
    const key = WI_TYPE_ORDER.includes(type) ? type : 'Task';

    if (!groups[key]) groups[key] = [];
    groups[key].push(wi);
  }

  // Sort by WI_TYPE_ORDER
  const sorted = {};
  for (const type of WI_TYPE_ORDER) {
    if (groups[type]) {
      sorted[type] = groups[type];
    }
  }
  // Remaining
  for (const [type, items] of Object.entries(groups)) {
    if (!sorted[type]) sorted[type] = items;
  }

  return sorted;
}

function extractTaskIdFromTitle(title) {
  const match = title.match(/(TASK[-\s]?\d+)/i);
  return match ? match[1].replace(/\s/, '-').toUpperCase() : null;
}

function generateReleaseNotes({ tag, sprint, workItems, repo, childTasks }) {
  const date = new Date().toISOString().split('T')[0];
  const version = tag.replace(/^v/, '');
  const grouped = groupWorkItems(workItems);

  // Count only parent work items (PBIs, Bugs, Features)
  const parents = workItems.filter(wi => {
    const type = wi.fields['System.WorkItemType'];
    return !['Task', 'Issue'].includes(type);
  });

  let notes = `## ${tag} (${date})\n\n`;
  notes += `> Sprint: **${sprint}**  \n`;
  notes += `> Work items: ${parents.length} pais, ${workItems.length} total\n\n`;

  notes += `### 🚀 O que foi entregue\n\n`;

  let hasContent = false;
  for (const type of WI_TYPE_ORDER) {
    const items = grouped[type];
    if (!items || items.length === 0) continue;
    hasContent = true;

    const emoji = WI_TYPE_EMOJI[type] || '📌';
    notes += `#### ${emoji} ${type === 'Product Backlog Item' ? 'PBIs' : type + 's'}\n\n`;

    for (const item of items) {
      const id = item.id;
      const title = item.fields['System.Title'] || '(sem título)';
      const state = item.fields['System.State'] || '';
      const taskId = extractTaskIdFromTitle(title);
      const adoUrl = `https://dev.azure.com/${ADO_ORG}/${encodeURIComponent(ADO_PROJECT)}/_workitems/edit/${id}`;

      notes += `- **#${id}** — [${title}](${adoUrl})`;
      if (taskId) notes += ` (\`${taskId}\`)`;
      notes += '\n';
    }
    notes += '\n';
  }

  if (!hasContent) {
    notes += '_Nenhum work item encontrado._\n\n';
  }

  // Child tasks section (optional detail)
  if (childTasks && childTasks.length > 0) {
    notes += `#### 🔧 Tarefas técnicas\n\n`;
    for (const task of childTasks) {
      const id = task.id;
      const title = task.fields['System.Title'] || '(sem título)';
      const parentId = task.fields['System.Parent'] || '';
      const adoUrl = `https://dev.azure.com/${ADO_ORG}/${encodeURIComponent(ADO_PROJECT)}/_workitems/edit/${id}`;
      notes += `- **#${id}** — [${title}](${adoUrl})`;
      if (parentId) notes += ` (parent: #${parentId})`;
      notes += '\n';
    }
    notes += '\n';
  }

  // Repository info
  if (repo) {
    notes += `### 📂 Repositórios\n\n`;
    notes += `- [${repo}](https://github.com/${repo})\n\n`;
  }

  // Post-release
  notes += `### 📌 Pós-release\n\n`;
  notes += `1. Verificar deploy em produção\n`;
  notes += `2. Fazer merge reverso \`main → release\`\n`;
  notes += `3. Comunicar o squad\n`;

  return notes;
}

function createGitHubRelease(tag, notes, repo) {
  const repoArg = repo ? `--repo ${repo}` : '';
  const tmpFile = path.join(__dirname, '..', '..', 'tmp', `release-notes-${tag}.md`);
  const tmpDir = path.dirname(tmpFile);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  fs.writeFileSync(tmpFile, notes, 'utf-8');

  const cmd = `gh release create ${tag} ${repoArg} --title "${tag}" --notes-file "${tmpFile}"`;
  try {
    run(cmd, { cwd: process.cwd() });
    // Cleanup
    fs.unlinkSync(tmpFile);
    return { success: true, url: `https://github.com/${repo || '(repo)'}/releases/tag/${tag}` };
  } catch (e) {
    return { success: false, error: e.message, notesFile: tmpFile, notes };
  }
}

function printUsage() {
  console.log(`
Uso: node .opencode/scripts/create-release.js [opções]

Opções:
  --sprint "<nome>"    Nome da sprint no Azure DevOps (ex: "Sprint 42") [obrigatório]
  --tag <versão>       Tag da release (ex: v1.9.10). Se omitido, auto-detecta
  --repo "<org/repo>"  Repositório GitHub (ex: your-org/your-repo) [obrigatório*
                       ou auto-detectado via 'git remote get-url origin']
  --preview            Apenas gera as notas, não cria a release
  --list-sprints       Lista todas as sprints disponíveis no ADO
  --help, -h           Exibe esta ajuda

  * Se a auto-detecção do repo falhar (sem git remote ou repo fora do
    padrão), o script aborta pedindo --repo explícito.

Exemplos:
  node .opencode/scripts/create-release.js --sprint "Sprint 42" --repo your-org/your-repo
  node .opencode/scripts/create-release.js --sprint "Sprint 42" --repo your-org/your-repo --tag v1.9.10 --preview
  node .opencode/scripts/create-release.js --list-sprints
`);
}

// ─── Interactive Wizard ───────────────────────────────────────────────────

/**
 * Cria interface readline para o wizard. O consumidor é responsável por
 * chamar `rl.close()` no fim (sucesso, erro ou cancelamento).
 * @returns {readline.Interface}
 */
function createWizardReadline() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

/**
 * Exibe cabeçalho visual com separador ASCII.
 * @param {string} text - texto a exibir
 */
function printHeader(text) {
  const line = '─'.repeat(60);
  console.error(`\n${line}\n  ${text}\n${line}`);
}

/**
 * Pergunta aberta ao usuário. Enter vazio usa o default.
 * @param {readline.Interface} rl
 * @param {string} question
 * @param {string} [defaultValue=''] - valor padrão se Enter sem input
 * @returns {Promise<string>}
 */
function ask(rl, question, defaultValue = '') {
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(prompt, (answer) => {
      const trimmed = (answer || '').trim();
      resolve(trimmed || defaultValue);
    });
  });
}

/**
 * Lista numerada com seleção por número. Aceita 'q' (sair) e 'r' (refresh).
 * Loop infinito até entrada válida.
 * @param {readline.Interface} rl
 * @param {string} question
 * @param {Array<string|{label: string, subtitle?: string}>} options
 * @param {{defaultIndex?: number, allowQuit?: boolean, allowRefresh?: boolean}} [opts]
 * @returns {Promise<{action: 'select'|'quit'|'refresh', index?: number, value: any}>}
 */
async function select(rl, question, options, opts = {}) {
  const { defaultIndex = 0, allowQuit = true, allowRefresh = false } = opts;
  while (true) {
    console.error(`\n${question}\n`);
    options.forEach((opt, i) => {
      const isDefault = i === defaultIndex;
      const marker = isDefault ? '●' : '○';
      const label = typeof opt === 'string' ? opt : opt.label;
      const sub = typeof opt === 'string' ? null : opt.subtitle;
      console.error(`  ${marker} ${String(i + 1).padStart(2)}. ${label}`);
      if (sub) console.error(`        ${sub}`);
    });
    const hint = ['número'];
    if (allowRefresh) hint.push('r (atualizar)');
    if (allowQuit) hint.push('q (sair)');
    const answer = await ask(rl, `→ Escolha [${hint.join(', ')}]`, String(defaultIndex + 1));
    if (allowQuit && answer.toLowerCase() === 'q') return { action: 'quit', value: null };
    if (allowRefresh && answer.toLowerCase() === 'r') return { action: 'refresh', value: null };
    const num = parseInt(answer, 10);
    if (Number.isInteger(num) && num >= 1 && num <= options.length) {
      return { action: 'select', index: num - 1, value: options[num - 1] };
    }
    console.error(`\n❌ Opção inválida. Digite um número entre 1 e ${options.length}.\n`);
  }
}

/**
 * Confirmação y/N. Default = N (não).
 * @param {readline.Interface} rl
 * @param {string} question
 * @param {boolean} [defaultNo=true]
 * @returns {Promise<boolean>}
 */
async function confirm(rl, question, defaultNo = true) {
  const hint = defaultNo ? '(s/N)' : '(N/s)';
  const answer = await ask(rl, `${question} ${hint}`, 'n');
  return ['s', 'y', 'sim', 'yes'].includes(answer.toLowerCase());
}

/**
 * Sugere próxima tag com base na última tag git (incrementa patch).
 * @returns {string}
 */
function suggestNextTag() {
  const last = getLastTag();
  if (!last) return 'v1.0.0';
  const m = last.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return 'v1.0.0';
  return `v${m[1]}.${m[2]}.${parseInt(m[3], 10) + 1}`;
}

/**
 * Carrega o catálogo de projetos do workbench.
 * @returns {object} conteúdo parseado de project-mapping.json
 */
function loadProjectMapping() {
  const mappingPath = path.join(__dirname, '..', 'config', 'project-mapping.json');
  return JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
}

/**
 * Detecta projeto a partir do git remote do cwd. Heurística simples.
 * @param {object} mapping - project-mapping.json parseado
 * @returns {string|null} chave do projeto detectado ou null
 */
function detectProjectFromCwd(mapping) {
  const repo = getCurrentRepo();
  if (!repo) return null;
  for (const [key, project] of Object.entries(mapping.projects)) {
    if (key === 'workbench' && repo === `${GITHUB_ORG}/.workbench`) return key;
    const repoNames = Object.values(project.repos || {});
    if (repoNames.some(r => r && repo.toLowerCase().includes(r.toLowerCase()))) return key;
  }
  return null;
}

/**
 * Lista repositórios de um projeto no formato 'org/repo'.
 * Workbench é caso especial: única opção é '{GITHUB_ORG}/.workbench'.
 * @param {string} projectKey
 * @param {object} project
 * @returns {string[]}
 */
function listProjectRepos(projectKey, project) {
  if (projectKey === 'workbench') return [`${GITHUB_ORG}/.workbench`];
  return Object.values(project.repos || {}).map(r => `${GITHUB_ORG}/${r}`);
}

/**
 * Loop principal do wizard interativo. Roteia o usuário por 7 etapas:
 * projeto → repositório → sprint → tag → preview → confirmação → criação.
 * Fecha o readline em todos os caminhos (sucesso, erro, cancelamento).
 * @returns {Promise<void>}
 */
async function wizardRun() {
  const rl = createWizardReadline();

  // SIGINT: readline emite 'SIGINT' no Ctrl+C; default seria matar o processo
  rl.on('SIGINT', () => {
    console.error('\n\n👋 Cancelado pelo usuário.');
    rl.close();
    process.exit(130);
  });
  // EOF (Ctrl+D / stdin fechado) antes de terminar o wizard
  rl.on('close', () => {
    if (!rl._destroyed) {
      rl._destroyed = true;
      // Se chegamos aqui antes de wizardRun retornar, força saída
      setImmediate(() => {
        if (process.exitCode == null) {
          console.error('\n👋 Entrada fechada. Cancelado.');
          process.exit(130);
        }
      });
    }
  });

  try {
    // Token check (mesma validação do modo CLI)
    if (!getAdoToken()) {
      process.stderr.write('\nERRO: ADO_MCP_AUTH_TOKEN não encontrado.\n');
      process.stderr.write('Adicione no arquivo .env: ADO_MCP_AUTH_TOKEN=seu_pat\n');
      process.stderr.write(`Gere em: https://dev.azure.com/${ADO_ORG}/_usersSettings/tokens\n`);
      process.exit(1);
    }

    printHeader('🚀 Criador de GitHub Release — Modo Interativo');

    // ── 1) Projeto ──────────────────────────────────────────────────────
    const mapping = loadProjectMapping();
    const projectEntries = Object.entries(mapping.projects);
    const detectedKey = detectProjectFromCwd(mapping);
    const defaultProjIdx = detectedKey
      ? projectEntries.findIndex(([k]) => k === detectedKey)
      : 0;

    const projResult = await select(
      rl,
      '📦 Qual projeto?',
      projectEntries.map(([key, p]) => ({ label: `${p.name} (${key})`, subtitle: p.description })),
      { defaultIndex: Math.max(0, defaultProjIdx) }
    );
    if (projResult.action === 'quit') { console.error('\n👋 Cancelado.'); return; }
    const [projectKey, project] = projectEntries[projResult.index];
    console.error(`\n✅ Projeto: ${project.name}`);

    // ── 2) Repositório ──────────────────────────────────────────────────
    const repoOptions = listProjectRepos(projectKey, project);
    if (repoOptions.length === 0) {
      console.error(`\n❌ Projeto "${projectKey}" não tem repos cadastrados.`);
      process.exit(1);
    }
    const currentRepo = getCurrentRepo();
    const defaultRepoIdx = currentRepo ? repoOptions.findIndex(r => r === currentRepo) : 0;
    const repoResult = await select(
      rl,
      '📂 Qual repositório GitHub?',
      repoOptions,
      { defaultIndex: Math.max(0, defaultRepoIdx) }
    );
    if (repoResult.action === 'quit') { console.error('\n👋 Cancelado.'); return; }
    const repo = repoResult.value;
    console.error(`\n✅ Repo: ${repo}`);

    // ── 3) Sprint (com suporte a refresh) ──────────────────────────────
    let sprintName = null;
    let sprintInfo = null;
    while (!sprintName) {
      console.error('\n🔍 Buscando sprints no Azure DevOps...');
      let sprints = [];
      try {
        sprints = await listSprints();
      } catch (e) {
        console.error(`\n❌ Erro ao listar sprints: ${e.message}`);
        const retry = await confirm(rl, 'Tentar novamente?', false);
        if (!retry) { console.error('\n👋 Cancelado.'); return; }
        continue;
      }
      if (sprints.length === 0) {
        console.error('\n⚠️ Nenhuma sprint encontrada no ADO.');
        const retry = await confirm(rl, 'Tentar novamente?', false);
        if (!retry) { console.error('\n👋 Cancelado.'); return; }
        continue;
      }
      const sprintResult = await select(
        rl,
        '🏃 Qual sprint?',
        sprints.map(s => ({ label: s.name, subtitle: s.path || s.timeFrame || '' })),
        { allowRefresh: true, defaultIndex: Math.max(0, sprints.length - 1) }
      );
      if (sprintResult.action === 'quit') { console.error('\n👋 Cancelado.'); return; }
      if (sprintResult.action === 'refresh') continue;

      const candidate = sprints[sprintResult.index].name;
      const found = await findSprint(candidate);
      if (!found.id) {
        console.error(`\n❌ Sprint "${candidate}" não encontrada.`);
        const retry = await confirm(rl, 'Tentar outra sprint?', false);
        if (!retry) { console.error('\n👋 Cancelado.'); return; }
        continue;
      }
      sprintName = candidate;
      sprintInfo = found;
      console.error(`\n✅ Sprint: ${sprintName}`);
    }

    // ── 4) Tag (com validação de formato) ──────────────────────────────
    const suggestedTag = suggestNextTag();
    let tag = await ask(rl, '🏷️  Tag da release', suggestedTag);
    const tagRe = /^v\d+\.\d+\.\d+(-[\w.]+)?$/;
    while (!tagRe.test(tag)) {
      console.error('❌ Formato inválido. Use vX.Y.Z (ex: v1.9.10 ou v1.0.0-beta.1)');
      tag = await ask(rl, '🏷️  Tag da release', suggestedTag);
    }
    console.error(`\n✅ Tag: ${tag}`);

    // ── 5) Preview ──────────────────────────────────────────────────────
    printHeader(`🔍 Preview — ${tag} → ${repo}`);
    console.error(`Projeto: ${project.name} (${projectKey})`);
    console.error(`Sprint:  ${sprintName}`);
    console.error(`Repo:    ${repo}\n`);

    const allWorkItems = await getWorkItemsFromSprint(sprintInfo.id);
    const parents = allWorkItems.filter(wi => wi.fields['System.WorkItemType'] !== 'Task');
    const childTasks = allWorkItems.filter(wi => wi.fields['System.WorkItemType'] === 'Task');
    console.error(`📊 ${allWorkItems.length} work items (${parents.length} pais, ${childTasks.length} tarefas)\n`);

    if (allWorkItems.length === 0) {
      const proceed = await confirm(rl, '⚠️ Nenhum work item. Continuar mesmo assim?', false);
      if (!proceed) { console.error('\n👋 Cancelado.'); return; }
    }

    const notes = generateReleaseNotes({
      tag,
      sprint: sprintName,
      workItems: allWorkItems,
      repo,
      childTasks,
    });

    console.error('─'.repeat(60));
    console.error(notes);
    console.error('─'.repeat(60));

    // ── 6) Confirmação final ────────────────────────────────────────────
    const confirmed = await confirm(rl, `Criar a GitHub Release ${tag} no repo ${repo}?`, true);
    if (!confirmed) {
      console.error('\n👋 Cancelado pelo usuário.');
      return;
    }

    // ── 7) Criar release (mesma função do modo CLI) ─────────────────────
    console.error(`\n🏷️  Criando GitHub Release ${tag}...`);
    const result = createGitHubRelease(tag, notes, repo);
    if (result.success) {
      console.log(JSON.stringify({
        action: 'created',
        project: projectKey,
        repo,
        sprint: sprintName,
        tag,
        workItemsTotal: allWorkItems.length,
        url: result.url,
      }, null, 2));
    } else {
      console.error(`❌ Erro ao criar release: ${result.error}`);
      console.error(`📄 Notas salvas em: ${result.notesFile}`);
      process.exitCode = 1;
    }
  } catch (e) {
    process.stderr.write(`\nERRO: ${e.message}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Detecção de modo: wizard se TTY disponível e nenhuma flag de CLI
  const CLI_FLAGS = ['--sprint', '--tag', '--repo', '--preview', '--list-sprints', '--help', '-h'];
  const hasFlags = args.some(a => CLI_FLAGS.includes(a));
  const isInteractive = !hasFlags && process.stdin.isTTY && process.stdout.isTTY;
  if (isInteractive) {
    return wizardRun();
  }

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  // Check ADO token
  if (!getAdoToken()) {
    process.stderr.write('ERRO: ADO_MCP_AUTH_TOKEN não encontrado.\n');
    process.stderr.write('Adicione no arquivo .env: ADO_MCP_AUTH_TOKEN=seu_pat\n');
    process.stderr.write('Gere em: https://dev.azure.com/' + ADO_ORG + '/_usersSettings/tokens\n');
    process.exit(1);
  }

  // List sprints
  if (args.includes('--list-sprints')) {
    try {
      const sprints = await listSprints();
      console.log(JSON.stringify({ sprints }, null, 2));
    } catch (e) {
      process.stderr.write(`ERRO ao listar sprints: ${e.message}\n`);
      process.exit(1);
    }
    process.exit(0);
  }

  // Parse arguments
  const sprintIndex = args.indexOf('--sprint');
  const tagIndex = args.indexOf('--tag');
  const repoIndex = args.indexOf('--repo');
  const isPreview = args.includes('--preview');

  const sprintName = sprintIndex >= 0 ? args[sprintIndex + 1] : null;
  let tag = tagIndex >= 0 ? args[tagIndex + 1] : null;
  let repo = repoIndex >= 0 ? args[repoIndex + 1] : getCurrentRepo();

  if (!sprintName) {
    process.stderr.write('ERRO: --sprint é obrigatório. Use --help para ajuda.\n');
    process.exit(1);
  }

  if (!repo) {
    process.stderr.write('ERRO: --repo é obrigatório e não pôde ser auto-detectado.\n');
    process.stderr.write('  → Especifique: --repo "org/nome-repo" (ex: --repo your-org/your-repo)\n');
    process.stderr.write('  → Ou rode sem flags para usar o wizard interativo (requer TTY).\n');
    process.exit(1);
  }

  // Auto-detect tag from git if not provided
  if (!tag) {
    const lastTag = getLastTag();
    if (lastTag) {
      // Increment patch
      const parts = lastTag.replace(/^v/, '').split('.').map(Number);
      tag = `v${parts[0]}.${parts[1]}.${(parts[2] || 0) + 1}`;
    } else {
      tag = 'v1.0.0';
    }
    console.error(`ℹ️ Tag não especificada. Usando: ${tag}`);
  }

  console.error(`🔍 Buscando sprint "${sprintName}" no Azure DevOps...`);

  try {
    // Find the sprint
    const sprint = await findSprint(sprintName);

    if (!sprint.id) {
      console.error(`❌ Sprint "${sprintName}" não encontrada.`);
      console.error('\nSprints disponíveis:');
      for (const s of sprint.all || []) {
        console.error(`  - "${s.name}" (${s.path || 'sem timeFrame'})`);
      }
      process.exit(1);
    }

    console.error(`✅ Sprint encontrada: ${sprint.name} (${sprint.path || ''})`);

    // Get work items
    console.error(`📦 Buscando work items da sprint...`);
    const allWorkItems = await getWorkItemsFromSprint(sprint.id);

    if (allWorkItems.length === 0) {
      console.error('⚠️ Nenhum work item encontrado na sprint.');
      process.exit(1);
    }

    // Separate parent items from child tasks
    const parents = allWorkItems.filter(wi => wi.fields['System.WorkItemType'] !== 'Task');
    const childTasks = allWorkItems.filter(wi => wi.fields['System.WorkItemType'] === 'Task');

    console.error(`📊 ${allWorkItems.length} work items encontrados:`);
    console.error(`   - ${parents.length} pais (PBIs, Bugs, Features)`);
    console.error(`   - ${childTasks.length} tarefas filhas`);

    // Generate notes
    const notes = generateReleaseNotes({
      tag,
      sprint: sprint.name,
      workItems: allWorkItems,
      repo,
      childTasks,
    });

    if (isPreview) {
      console.log(JSON.stringify({
        action: 'preview',
        tag,
        repo,
        sprint: sprint.name,
        workItemsTotal: allWorkItems.length,
        parentCount: parents.length,
        taskCount: childTasks.length,
        notesPreview: notes,
      }, null, 2));
      process.exit(0);
    }

    // Create release
    console.error(`🏷️  Criando GitHub Release ${tag}...`);
    const result = createGitHubRelease(tag, notes, repo);

    if (result.success) {
      console.log(JSON.stringify({
        action: 'created',
        tag,
        repo,
        sprint: sprint.name,
        workItemsTotal: allWorkItems.length,
        url: result.url,
      }, null, 2));
    } else {
      console.error(`❌ Erro ao criar release: ${result.error}`);
      console.error(`📄 Notas salvas em: ${result.notesFile}`);
      process.exit(1);
    }

  } catch (e) {
    process.stderr.write(`ERRO: ${e.message}\n`);
    process.exit(1);
  }
}

main().catch(e => {
  process.stderr.write(`ERRO FATAL: ${e.message}\n`);
  process.exit(1);
});
