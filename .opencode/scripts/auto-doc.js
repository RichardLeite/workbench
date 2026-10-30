#!/usr/bin/env node

/**
 * auto-doc.js — Geração automática de documentação.
 *
 * Uso:
 *   node .opencode/scripts/auto-doc.js readme              # README.md
 *   node .opencode/scripts/auto-doc.js api <caminho-rotas>  # API docs
 *   node .opencode/scripts/auto-doc.js api --project <slug> # API docs via project-mapping
 *   node .opencode/scripts/auto-doc.js all                  # Tudo
 *   node .opencode/scripts/auto-doc.js all --project <slug> # Tudo via project-mapping
 *
 * Opções:
 *   --project <slug>   Resolve rotas automaticamente via project-mapping.json
 *                      (ex: meu-projeto, fiscal, outro-projeto)
 *
 * Saída: JSON com { tipo, arquivo, conteudo, alteracoes }.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch { return ''; }
}

function projectName() {
  const origin = run('git remote get-url origin');
  return origin.split('/').pop()?.replace('.git', '') || path.basename(process.cwd());
}

// ---------------------------------------------------------------------------
// Project-mapping resolver
// ---------------------------------------------------------------------------

const MAPPING_PATH = path.resolve(__dirname, '..', 'config', 'project-mapping.json');

function loadMapping() {
  return JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf-8'));
}

function resolveApiRepo(slug) {
  try {
    const mapping = loadMapping();
    const project = mapping.projects && mapping.projects[slug];
    if (project && project.repos && project.repos.api) {
      return path.resolve(__dirname, '..', '..', project.repos.api, 'src', 'routes');
    }
  } catch (e) {
    // fall through to default
  }
  return null;
}

function listAvailableProjects() {
  try {
    const mapping = loadMapping();
    return Object.keys(mapping.projects || {});
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// CLI arg parser
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const positional = [];
  let project = null;
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && i + 1 < args.length) {
      project = args[++i];
    } else if (!args[i].startsWith('--')) {
      positional.push(args[i]);
    }
  }
  return { type: positional[0] || 'readme', extra: positional[1] || null, project };
}

// ---------------------------------------------------------------------------
// Scanner: README
// ---------------------------------------------------------------------------

function scanReadme() {
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) : {};

  const scripts = pkg.scripts ? Object.entries(pkg.scripts).slice(0, 10) : [];
  const dirs = fs.readdirSync(process.cwd())
    .filter(f => fs.statSync(f).isDirectory() && !f.startsWith('.') && f !== 'node_modules');

  const content = '# ' + (pkg.name || projectName()) + '\n' +
    '\n' +
    (pkg.description || '') + '\n' +
    '\n' +
    '## Stack\n' +
    '\n' +
    (pkg.dependencies
      ? Object.keys(pkg.dependencies).slice(0, 15).map(d => '- ' + d).join('\n')
      : 'N/A') + '\n' +
    '\n' +
    '## Scripts\n' +
    '\n' +
    '| Comando | Descrição |\n' +
    '|---------|-----------|\n' +
    scripts.map(([k, v]) => '| `' + k + '` | `' + v + '` |').join('\n') + '\n' +
    '\n' +
    '## Estrutura\n' +
    '\n' +
    dirs.map(d => '- ' + d).join('\n') + '\n';

  return { tipo: 'readme', arquivo: 'README.md', conteudo: content };
}

// ---------------------------------------------------------------------------

function scanApi(routesPath, projectSlug) {
  if (!routesPath || !fs.existsSync(routesPath)) {
    // Try project-mapping resolution first
    if (projectSlug) {
      const resolved = resolveApiRepo(projectSlug);
      if (resolved && fs.existsSync(resolved)) {
        routesPath = resolved;
      }
    }
  }

  if (!routesPath || !fs.existsSync(routesPath)) {
    // Fallback: try common local paths
    const candidates = [
      'src/routes',
      'src/router',
      'routes',
      'src/controllers',
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) { routesPath = c; break; }
    }
  }

  if (!routesPath || !fs.existsSync(routesPath)) {
    return { tipo: 'api', arquivo: 'API.md', conteudo: '# API\n\nNo route files found.' };
  }

  let endpoints = [];
  const files = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js') || e.name.endsWith('.ts')) files.push(full);
    }
  }
  walk(routesPath);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    // Match Express route patterns
    const routePatterns = [
      ...content.matchAll(/(?:router|route)\.(get|post|put|delete|patch)\s*\(\s*['"](\/[^'"]*)['"]/gi),
      ...content.matchAll(/app\.(get|post|put|delete|patch)\s*\(\s*['"](\/[^'"]*)['"]/gi),
    ];
    for (const m of routePatterns) {
      endpoints.push({ method: m[1].toUpperCase(), path: m[2], file: path.relative(process.cwd(), file) });
    }
  }

  // Group by domain
  const grouped = {};
  for (const ep of endpoints) {
    const domain = ep.path.split('/').filter(Boolean)[0] || 'root';
    if (!grouped[domain]) grouped[domain] = [];
    grouped[domain].push(ep);
  }

  let content = '# API — ' + projectName() + '\n\n';
  for (const [domain, eps] of Object.entries(grouped)) {
    content += '\n## ' + domain.charAt(0).toUpperCase() + domain.slice(1) + '\n';
    content += '| Método | Rota | Arquivo |\n|--------|------|---------|\n';
    for (const ep of eps) {
      content += '| ' + ep.method + ' | `' + ep.path + '` | `' + ep.file + '` |\n';
    }
  }

  return { tipo: 'api', arquivo: 'API.md', conteudo: content };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { type, extra, project } = parseArgs(process.argv);

  // Validate --project slug if provided
  if (project) {
    const available = listAvailableProjects();
    if (!available.includes(project)) {
      console.error(
        `❌ Projeto '${project}' não encontrado em project-mapping.json. ` +
        `Projetos disponíveis: ${available.join(', ')}`
      );
      process.exit(1);
    }
  }

  let result;

  switch (type) {
    case 'readme':
      result = scanReadme();
      break;
    case 'api':
      result = scanApi(extra, project);
      break;
    case 'all':
      result = {
        tipo: 'all',
        artefatos: [scanReadme(), scanApi(null, project)],
      };
      break;
    default:
      console.error(`Unknown type: ${type}. Use: readme, api, all`);
      process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
