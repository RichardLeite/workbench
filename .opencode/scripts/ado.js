#!/usr/bin/env node
/**
 * ado.js — Central de funções ADO que o MCP não cobre.
 *
 * Fluxos:
 *   resolveProject — resolve projeto, git flow e contexto ADO
 *   parseAbReference — normaliza AB# / URL / ID numérico
 *   getFallbackProjects — lista ordenada de projetos para fallback
 *
 * Uso (CLI):
 *   node .opencode/scripts/ado.js resolve [--project X | --type sprint | --url ... | --list | --validate]
 *   node .opencode/scripts/ado.js parse "AB#1234" | "#1234" | "1234" | "<url>"
 *   node .opencode/scripts/ado.js fallback
 *
 * API (require):
 *   const ado = require('./.opencode/scripts/ado.js');
 *   ado.resolveProject({ project: 'Squad X' });
 *   ado.parseAbReference('AB#1234');
 *   ado.getFallbackProjects();
 */

'use strict';

const path = require('path');
const fs = require('fs');

// ─── Paths ───────────────────────────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'config', 'ado-context.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Config não encontrado: ${CONFIG_PATH}`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function getDefaultGitFlow(type) {
  if (type === 'hotfix') {
    return {
      command: '/git-hotfix',
      base: 'main',
      branchPattern: 'fix/TASK-XXXX',
      branchPatternRelease: 'fix/TASK-XXXX-release',
      prCount: 2,
    };
  }
  return {
    command: '/git-sprint',
    base: 'release',
    branchPattern: 'feat/TASK-XXXX',
    prCount: 1,
  };
}

// ─── 1. resolveProject ────────────────────────────────────────────────────────

/**
 * Resolve projeto, git flow e contexto ADO.
 *
 * @param {Object} [opts] - Opções de resolução.
 * @param {string} [opts.project] - Nome exato do projeto.
 * @param {string} [opts.type] - 'sprint' | 'hotfix'.
 * @param {string} [opts.url] - URL completa do Azure DevOps.
 * @param {boolean} [opts.list] - Listar todos os projetos.
 * @param {boolean} [opts.validate] - Validar config.
 * @returns {{ project, organization, team, projectId, type, boardUrl, gitFlow }|Array|Object}
 */
function resolveProject(opts = {}) {
  const config = loadConfig();

  // --list
  if (opts.list) {
    return Object.entries(config.projects).map(([name, entry]) => ({
      project: name,
      type: entry.type,
      team: entry.team,
      gitFlow: (entry.gitFlow || getDefaultGitFlow(entry.type)).command,
    }));
  }

  // --validate
  if (opts.validate) {
    const errors = [];
    if (!config.organization) errors.push('organization ausente');
    if (!config.projects || Object.keys(config.projects).length === 0) errors.push('projects vazio');
    for (const [name, entry] of Object.entries(config.projects || {})) {
      if (!entry.type) errors.push(`${name}: type ausente`);
      if (!entry.team) errors.push(`${name}: team ausente`);
      if (!entry.projectId) errors.push(`${name}: projectId ausente`);
      if (entry.type && !['sprint', 'hotfix'].includes(entry.type)) {
        errors.push(`${name}: type inválido ("${entry.type}")`);
      }
    }
    if (errors.length > 0) throw new Error(`Config inválido:\n  ${errors.join('\n  ')}`);
    return { valid: true, projects: Object.keys(config.projects).length };
  }

  // --type
  if (opts.type) {
    const found = Object.entries(config.projects).find(([, e]) => e.type === opts.type);
    if (!found) throw new Error(`Nenhum projeto do tipo "${opts.type}" encontrado`);
    return buildProject(config, found[0]);
  }

  // --url
  if (opts.url) {
    const match = opts.url.match(/dev\.azure\.com\/[^/]+\/([^/?]+)/);
    if (!match) throw new Error(`URL inválida: ${opts.url}`);
    const projectName = decodeURIComponent(match[1]);
    return buildProject(config, projectName);
  }

  // --project ou default
  const projectName = opts.project || config.defaultProject || Object.keys(config.projects)[0];
  return buildProject(config, projectName);
}

function buildProject(config, projectName) {
  const entry = config.projects[projectName];
  if (!entry) throw new Error(`Projeto "${projectName}" não encontrado em ado-context.json`);
  return {
    project: projectName,
    organization: config.organization,
    team: entry.team,
    projectId: entry.projectId,
    type: entry.type,
    boardUrl: entry.boardUrl || `https://dev.azure.com/${config.organization}/${encodeURIComponent(projectName)}`,
    gitFlow: entry.gitFlow || getDefaultGitFlow(entry.type),
  };
}

// ─── 2. parseAbReference ─────────────────────────────────────────────────────

/**
 * Parseia referência AB# em formato padronizado.
 *
 * @param {string} str - Input: "AB#1234", "#1234", "1234", URL completa.
 * @returns {{ id: number|null, project?: string, raw: string, format: string, error?: string }}
 */
function parseAbReference(str) {
  if (typeof str !== 'string' || !str.trim()) {
    return { id: null, raw: str || '', format: 'INVALID', error: 'Input vazio' };
  }

  const trimmed = str.trim();

  // URL completa: dev.azure.com/.../edit/1234
  const urlMatch = trimmed.match(/dev\.azure\.com\/[^/]+\/([^/?]+)\/.*?(?:edit|workitem)(?:\/|%2F)(\d+)/i);
  if (urlMatch) {
    return {
      id: parseInt(urlMatch[2], 10),
      project: decodeURIComponent(urlMatch[1]),
      raw: trimmed,
      format: 'FULL_URL',
    };
  }

  // AB#1234 (puro ou em texto misto — ex: "Corrigir bug AB#1234 no módulo")
  const abHash = trimmed.match(/AB#(\d+)/i);
  if (abHash) {
    return { id: parseInt(abHash[1], 10), raw: trimmed, format: 'AB_HASH' };
  }

  // #1234
  const hashOnly = trimmed.match(/^#(\d+)$/);
  if (hashOnly) {
    return { id: parseInt(hashOnly[1], 10), raw: trimmed, format: 'HASH_ONLY' };
  }

  // 1234 (numérico puro)
  const numeric = trimmed.match(/^(\d+)$/);
  if (numeric) {
    return { id: parseInt(numeric[1], 10), raw: trimmed, format: 'NUMERIC' };
  }

  return { id: null, raw: trimmed, format: 'INVALID', error: `Unable to extract numeric ID from "${trimmed}"` };
}

// ─── 3. getFallbackProjects ───────────────────────────────────────────────────

/**
 * Retorna lista ordenada de projetos para fallback (defaultProject primeiro).
 *
 * @returns {{ defaultProject: string, projects: Array<{ project, team, projectId, type }> }}
 */
function getFallbackProjects() {
  const config = loadConfig();
  const defaultProject = config.defaultProject || Object.keys(config.projects)[0];
  const entries = Object.entries(config.projects).map(([project, entry]) => ({
    project,
    team: entry.team,
    projectId: entry.projectId,
    type: entry.type,
  }));

  // Reordena: defaultProject primeiro, depois o resto
  const sorted = [
    ...entries.filter(e => e.project === defaultProject),
    ...entries.filter(e => e.project !== defaultProject),
  ];

  return { defaultProject, projects: sorted };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function cli(args = process.argv.slice(2)) {
  const command = args[0];

  if (!command || command === '--help') {
    console.log(`
  ado.js — Central de funções ADO

  Comandos:
    resolve [--project X | --type sprint | --url ... | --list | --validate]
    parse   "<AB#1234 | #1234 | 1234 | url>"
    fallback

  Exemplos:
    node .opencode/scripts/ado.js resolve
    node .opencode/scripts/ado.js resolve --url "https://..."
    node .opencode/scripts/ado.js resolve --list
    node .opencode/scripts/ado.js parse "AB#21284"
    node .opencode/scripts/ado.js parse "https://dev.azure.com/.../edit/21284"
    node .opencode/scripts/ado.js fallback
`);
    return;
  }

  try {
    if (command === 'resolve') {
      const flags = {};
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--project') flags.project = args[++i];
        else if (args[i] === '--type') flags.type = args[++i];
        else if (args[i] === '--url') flags.url = args[++i];
        else if (args[i] === '--list') flags.list = true;
        else if (args[i] === '--validate') flags.validate = true;
      }
      const result = resolveProject(flags);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (command === 'parse') {
      const input = args.slice(1).join(' ');
      if (!input) {
        process.stderr.write('ERRO: parse requer uma string de entrada\n');
        process.exit(1);
      }
      console.log(JSON.stringify(parseAbReference(input), null, 2));
      return;
    }

    if (command === 'fallback') {
      console.log(JSON.stringify(getFallbackProjects(), null, 2));
      return;
    }

    process.stderr.write(`ERRO: Comando desconhecido "${command}". Use: resolve, parse, fallback\n`);
    process.exit(1);

  } catch (err) {
    process.stderr.write(`ERRO: ${err.message}\n`);
    process.exit(1);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { resolveProject, parseAbReference, getFallbackProjects, loadConfig, cli };

if (require.main === module) {
  cli();
}
