#!/usr/bin/env node

/**
 * cycle-time.js — Coleta métricas do processo de desenvolvimento.
 *
 * Uso:
 *   node .opencode/scripts/cycle-time.js                                      # Relatório completo (default: meu-projeto)
 *   node .opencode/scripts/cycle-time.js --mode=sprint                        # Apenas sprint atual
 *   node .opencode/scripts/cycle-time.js --mode=tokens                        # Apenas tokens
 *   node .opencode/scripts/cycle-time.js --mode=defects                       # Apenas defeitos
 *   node .opencode/scripts/cycle-time.js --mode=coverage                      # Apenas cobertura
 *   node .opencode/scripts/cycle-time.js --project=legado --mode=defects        # Defeitos de outro projeto
 *   node .opencode/scripts/cycle-time.js --since=2026-01-01                   # Filtrar por data
 *
 * Saída: JSON no stdout.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
  } catch {
    return '';
  }
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24) * 10) / 10;
}

function avg(arr) { return arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10 : 0; }
function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// Coleta: Cycle Time via git log
// ---------------------------------------------------------------------------

function collectCycleTime() {
  // Pega PRs mergeados (commits com "Merge pull request")
  const mergeLog = run(`git log --all --merges --oneline --since="2026-01-01" --format="%H|%ct|%s"`);
  if (!mergeLog) return { error: 'No merge commits found', prs: [] };

  const prs = [];
  for (const line of mergeLog.split('\n').filter(Boolean)) {
    const [hash, ts, ...msgParts] = line.split('|');
    const msg = msgParts.join('|');
    const mergeDate = new Date(parseInt(ts) * 1000);

    // Extrair branch name da mensagem de merge
    const branchMatch = msg.match(/into\s+(\S+)/);
    const prMatch = msg.match(/pull request #(\d+)/);

    // Encontrar o primeiro commit da branch
    const parents = run(`git log --format="%H" ${hash} -2 --reverse`).split('\n').filter(Boolean);
    const firstParent = parents[0]; // second parent is the branch tip
    // Get the actual branch commit range
    const branchLog = run(`git log --format="%ct" ${parents[0]}..${parents[1]} 2>nul`).split('\n').filter(Boolean);
    const firstCommitTs = branchLog.length ? branchLog[branchLog.length - 1] : null;

    if (firstCommitTs) {
      const firstDate = new Date(parseInt(firstCommitTs) * 1000);
      prs.push({
        hash,
        pr: prMatch ? prMatch[1] : null,
        branch: branchMatch ? branchMatch[1] : null,
        firstCommit: firstDate.toISOString(),
        mergedAt: mergeDate.toISOString(),
        cycleDays: daysBetween(firstDate, mergeDate),
      });
    }
  }
  return prs;
}

// ---------------------------------------------------------------------------
// Coleta: Token estimates from checkpoint files
// ---------------------------------------------------------------------------

function collectTokens() {
  const base = path.join(__dirname, '..', 'knowledge', 'plans');
  const tokens = { total: 0, byAgent: {}, byTask: [] };

  if (!fs.existsSync(base)) return tokens;

  const files = fs.readdirSync(base).filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(base, file), 'utf-8'));
      // Estimate: 1 token ≈ 4 characters in prompts/outputs
      const estimated = Math.round(JSON.stringify(data).length / 4);
      tokens.total += estimated;
      tokens.byTask.push({ file, estimated });
    } catch { /* skip corrupt files */ }
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Project mapping resolution
// ---------------------------------------------------------------------------

const MAPPING_PATH = path.resolve(__dirname, '..', 'config', 'project-mapping.json');

function loadProjectMapping() {
  return JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf-8'));
}

function resolveProjectPaths(slug) {
  const mapping = loadProjectMapping();
  const project = mapping.projects[slug];
  if (!project) throw new Error(`Projeto "${slug}" não encontrado em project-mapping.json`);

  const repoApiName = project.repos?.api;
  const repoAppName = project.repos?.app;

  return {
    knowledgeBugsDir: project.knowledge
      ? path.resolve(__dirname, '..', '..', project.knowledge, 'backlog', 'bugs')
      : null,
    apiCoverageLcov: repoApiName
      ? path.resolve(__dirname, '..', '..', repoApiName, 'coverage', 'lcov.info')
      : null,
    appCoverageLcov: repoAppName
      ? path.resolve(__dirname, '..', '..', repoAppName, 'coverage', 'lcov.info')
      : null,
  };
}

// ---------------------------------------------------------------------------
// Coleta: Defects from knowledge backlog/bugs
// ---------------------------------------------------------------------------

function collectDefects(projectSlug) {
  const slug = projectSlug || 'workbench';
  const paths = resolveProjectPaths(slug);

  const defects = { open: 0, closed: 0, byPriority: { P0: 0, P1: 0, P2: 0 }, total: 0, project: slug };

  if (paths.knowledgeBugsDir && fs.existsSync(paths.knowledgeBugsDir)) {
    const files = fs.readdirSync(paths.knowledgeBugsDir).filter(f => f.endsWith('.md'));
    defects.total = files.length;
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(paths.knowledgeBugsDir, f), 'utf-8');
        if (content.includes('## Status: Aberto') || content.includes('status: aberto')) defects.open++;
        else defects.closed++;
        if (content.includes('P0') || content.includes('severidade: crítica')) defects.byPriority.P0++;
        else if (content.includes('P1') || content.includes('severidade: alta')) defects.byPriority.P1++;
        else if (content.includes('P2')) defects.byPriority.P2++;
      } catch { /* skip unreadable */ }
    }
  }

  return defects;
}

// ---------------------------------------------------------------------------
// Coleta: Coverage from lcov files
// ---------------------------------------------------------------------------

function collectCoverage(projectSlug) {
  const slug = projectSlug || 'workbench';
  const paths = resolveProjectPaths(slug);
  const coverage = { backend: null, frontend: null };

  for (const [key, lcovPath] of [['backend', paths.apiCoverageLcov], ['frontend', paths.appCoverageLcov]]) {
    if (lcovPath && fs.existsSync(lcovPath)) {
      const content = fs.readFileSync(lcovPath, 'utf-8');
      const lines = content.match(/^DA:\d+,(\d+)/gm);
      if (lines) {
        const hit = lines.filter(l => l.endsWith(',1')).length;
        const total = lines.length;
        coverage[key] = total ? Math.round(hit / total * 100) : 0;
      }
    }
  }
  return coverage;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const mode = args.find(a => a.startsWith('--mode='))?.split('=')[1] || 'all';
  const since = args.find(a => a.startsWith('--since='))?.split('=')[1] || null;
  const projectEq = args.find(a => a.startsWith('--project='));
  const projectIdx = args.indexOf('--project');
  const projectSlug = projectEq?.split('=')[1]
    || (projectIdx >= 0 ? args[projectIdx + 1] : null)
    || 'workbench';

  // Validate project slug early
  try {
    resolveProjectPaths(projectSlug);
  } catch (err) {
    console.error(`Erro: ${err.message}`);
    process.exit(1);
  }

  const result = {
    timestamp: new Date().toISOString(),
    mode,
    project: projectSlug,
    repository: run('git remote get-url origin') || 'unknown',
    branch: run('git branch --show-current') || 'unknown',
  };

  if (mode === 'all' || mode === 'sprint') {
    const prs = collectCycleTime();
    const cycleDays = prs.filter(p => p.cycleDays).map(p => p.cycleDays);
    result.cycleTime = {
      prs: prs.length,
      avg: avg(cycleDays),
      median: median(cycleDays),
      p50: percentile(cycleDays, 50),
      p80: percentile(cycleDays, 80),
      p95: percentile(cycleDays, 95),
      min: cycleDays.length ? Math.min(...cycleDays) : 0,
      max: cycleDays.length ? Math.max(...cycleDays) : 0,
    };
  }

  if (mode === 'all' || mode === 'tokens') {
    result.tokens = collectTokens();
  }

  if (mode === 'all' || mode === 'defects') {
    result.defects = collectDefects(projectSlug);
  }

  if (mode === 'all' || mode === 'coverage') {
    result.coverage = collectCoverage(projectSlug);
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
