#!/usr/bin/env node
/**
 * Smart Reviewer Sorter — Weighted + Load Balance + Seniority
 *
 * Usage:
 *   node .opencode/scripts/reviewer-sort.js [options]
 *
 * Options:
 *   --complexity <complexo|moderado|simples>  PR complexity (default: auto if --pr)
 *   --author <github_login>                    PR author (excluded from draw)
 *   --count <1|2>                              Number of reviewers to pick (default: 1)
 *   --pr <number>                              Auto-detect complexity from PR diff
 *   --repo <owner/repo>                        GitHub repo (default: GITHUB_OWNER/.workbench)
 *   --reset                                    Reset ALL reviewCount to 0
 *
 * Output (stdout JSON):
 *   {
 *     "complexity": { "label": "...", "value": "..." },
 *     "selected": [{ "name": "...", "email": "...", "github": "...", "seniority": "...", "weight": N, "reviewCount": N }],
 *     "algorithm": { "totalEligible": N, "weights": [...] },
 *     "reset": true|false
 *   }
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CONFIG_PATH = path.resolve(__dirname, '../config/eligible-reviewers.json');
const LOCK_PATH = path.resolve(__dirname, '../config/reviewer.lock');
const LOCK_TTL_MS = 30000; // 30 seconds
const VALID_COMPLEXITIES = ['complexo', 'moderado', 'simples'];
const CORE_EXTENSIONS = /\.(js|ts|py|rb|java|go|rs|php|jsx|tsx)$/;

// ─── Lock mechanism ──────────────────────────────────────────────
function acquireLock() {
  const maxRetries = 25;
  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: 'wx' });
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;

      // Stale check: lock older than TTL → break it
      try {
        const stat = fs.statSync(LOCK_PATH);
        if (Date.now() - stat.mtimeMs > LOCK_TTL_MS) {
          fs.unlinkSync(LOCK_PATH);
          continue;
        }
      } catch (statErr) {
        // Lock file removed by another process, retry
        continue;
      }

      // Busy wait 200ms
      const start = Date.now();
      while (Date.now() - start < 200) { /* busy wait */ }
    }
  }
  console.error(JSON.stringify({ error: 'Could not acquire lock after 25 retries' }));
  process.exit(1);
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_PATH)) {
      const pid = fs.readFileSync(LOCK_PATH, 'utf8').trim();
      if (pid === String(process.pid) || pid === '') {
        fs.unlinkSync(LOCK_PATH);
      }
    }
  } catch (e) {
    // Best effort
  }
}

// ─── Config read/write ───────────────────────────────────────────
function readConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

// ─── Daily reset check ──────────────────────────────────────────
function checkDailyReset(config) {
  const today = new Date().toISOString().split('T')[0];
  const lastReset = config._lastReset || '';

  if (lastReset !== today) {
    for (const r of config.reviewers) {
      r.reviewCount = 0;
    }
    config._lastReset = today;
    return true;
  }
  return false;
}

// ─── Weight calculation ──────────────────────────────────────────
function calcWeights(reviewers) {
  const maxCount = Math.max(...reviewers.map(r => r.reviewCount), 1);

  return reviewers.map(r => {
    const base = r.weightMultiplier || 1;
    const loadBonus = 1 + ((maxCount - r.reviewCount) / maxCount) * 2;
    const finalWeight = base * loadBonus;

    return {
      ...r,
      displayName: r.name,
      finalWeight: Math.round(finalWeight * 100) / 100,
    };
  });
}

// ─── Weighted random selection ───────────────────────────────────
function weightedPick(weightedList, count, excludeGitHub) {
  let elegiveis = weightedList.filter(r => r.active !== false);

  if (excludeGitHub) {
    elegiveis = elegiveis.filter(r => r.github !== excludeGitHub);
  }

  if (elegiveis.length === 0) {
    return { selected: [], error: 'Nenhum revisor elegível disponível' };
  }

  const picks = [];
  const remaining = [...elegiveis];

  for (let p = 0; p < count && remaining.length > 0; p++) {
    const totalWeight = remaining.reduce((s, r) => s + r.finalWeight, 0);
    let rand = Math.random() * totalWeight;

    let chosenIdx = 0;
    for (let i = 0; i < remaining.length; i++) {
      rand -= remaining[i].finalWeight;
      if (rand <= 0) { chosenIdx = i; break; }
    }

    picks.push(remaining[chosenIdx]);
    remaining.splice(chosenIdx, 1);
  }

  return { selected: picks };
}

// ─── Complexity filter ────────────────────────────────────────────
function filterByComplexity(reviewers, complexity) {
  if (complexity === 'simples') {
    return reviewers;
  }
  return reviewers.filter(r => r.seniority === 'pleno' || r.seniority === 'senior');
}

// ─── Auto-detect complexity from PR diff ─────────────────────────
function detectComplexityFromPR(prNumber, repo) {
  try {
    const args = ['pr', 'view', String(prNumber), '--json', 'additions,deletions,changedFiles,files'];
    if (repo) args.push('--repo', repo);
    const output = execFileSync('gh', args, { encoding: 'utf8', timeout: 15000 });
    const data = JSON.parse(output);

    const totalChanges = (data.additions || 0) + (data.deletions || 0);
    const fileCount = data.changedFiles || 0;
    const files = data.files || [];

    const newFiles = files.filter(f => f.changeType === 'ADDED').length;
    const modifiedExisting = files.filter(f => f.changeType === 'MODIFIED').length;

    // Detect if changes touch core logic (scripts, source code, not just docs/config)
    const touchesCoreLogic = files.some(f => {
      const p = f.path.toLowerCase();
      return CORE_EXTENSIONS.test(p) && !p.includes('/test/') && !p.includes('/spec/') && !p.includes('/__tests__/');
    });

    // Check if mostly config/docs (reduces complexity)
    const isMostlyConfigDocs = files.every(f => {
      const p = f.path.toLowerCase();
      return p.endsWith('.md') || p.includes('/config/') || p.includes('/test/') || p.includes('/spec/');
    });

    // New script file with significant size
    const hasNewScript = files.some(f =>
      f.changeType === 'ADDED' && CORE_EXTENSIONS.test(f.path) && (data.additions || 0) > 200
    );

    // Heuristic rules
    if (totalChanges > 800 || fileCount > 12 || (totalChanges > 300 && touchesCoreLogic && modifiedExisting > 3)) {
      return { complexity: 'complexo', emoji: '🔴', reason: `${totalChanges} linhas em ${fileCount} arquivos (${newFiles} novos, ${modifiedExisting} modificados)` };
    }
    if (isMostlyConfigDocs && totalChanges <= 300) {
      return { complexity: 'simples', emoji: '🟢', reason: `${totalChanges} linhas em ${fileCount} arquivos (majoritariamente config/doc)` };
    }
    if (totalChanges > 120 || fileCount > 5 || touchesCoreLogic) {
      return { complexity: 'moderado', emoji: '🟡', reason: `${totalChanges} linhas em ${fileCount} arquivos (${newFiles} novos, ${modifiedExisting} modificados)` };
    }
    return { complexity: 'simples', emoji: '🟢', reason: `${totalChanges} linhas em ${fileCount} arquivos` };
  } catch (e) {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────
function main() {
  // Parse args
  const args = {};
  process.argv.slice(2).forEach((arg, i, arr) => {
    if (arg.startsWith('--')) {
      const key = arg.replace('--', '');
      const val = arr[i + 1];
      if (val && !val.startsWith('--')) {
        args[key] = val;
      } else {
        args[key] = true;
      }
    }
  });

  // Validate inputs
  if (args.count) {
    const c = parseInt(args.count, 10);
    if (c < 1 || c > 6) {
      console.error(JSON.stringify({ error: '--count deve ser 1 ou 2 (máx 6)' }));
      process.exit(1);
    }
  }

  if (args.complexity && !VALID_COMPLEXITIES.includes(args.complexity)) {
    console.error(JSON.stringify({ error: `Complexidade inválida: ${args.complexity}. Use: ${VALID_COMPLEXITIES.join(', ')}` }));
    process.exit(1);
  }

  if (args.pr && !/^\d+$/.test(String(args.pr))) {
    console.error(JSON.stringify({ error: `--pr deve ser um número. Recebido: ${args.pr}` }));
    process.exit(1);
  }

  // Defaults
  let complexity = args.complexity || 'moderado';
  const author = args.author || null;
  const count = Math.min(Math.max(parseInt(args.count, 10) || 1, 1), 6);
  const shouldReset = !!args.reset;
  const prAuto = args.pr || null;
  const repo = args.repo || `${process.env.GITHUB_OWNER || ''}/.workbench`;

  // Auto-detect complexity from PR
  if (prAuto) {
    const detected = detectComplexityFromPR(prAuto, repo);
    if (detected) {
      complexity = detected.complexity;
      console.error(`[auto] Complexidade detectada: ${detected.emoji} ${detected.complexity} (${detected.reason})`);
    } else {
      console.error('[auto] Não foi possível detectar complexidade. Usando padrão: moderado.');
    }
  }

  try {
    const config = readConfig();

    // Daily reset
    let didReset = false;
    if (shouldReset) {
      for (const r of config.reviewers) {
        r.reviewCount = 0;
      }
      config._lastReset = new Date().toISOString().split('T')[0];
      writeConfig(config);
      console.log(JSON.stringify({ reset: true, message: 'reviewCount zerado para todos' }));
      process.exit(0);
    } else {
      didReset = checkDailyReset(config);
    }

    // Acquire lock
    acquireLock();

    try {
      const freshConfig = readConfig();
      const allReviewers = freshConfig.reviewers;

      // Filter by maxReviewsPerPersonPerSprint constraint
      const maxAllowed = freshConfig.constraints?.maxReviewsPerPersonPerSprint || 5;
      let eligible = filterByComplexity(allReviewers, complexity)
        .filter(r => (r.reviewCount || 0) < maxAllowed);

      // Emergency: if all filtered out, allow anyone
      if (eligible.length === 0) {
        eligible = filterByComplexity(allReviewers, complexity);
        console.error('[aviso] Todos os revisores atingiram o limite. Usando lista completa.');
      }

      const weighted = calcWeights(eligible);
      const result = weightedPick(weighted, count, author);

      if (result.error) {
        console.error(JSON.stringify({ error: result.error }));
        process.exit(1);
      }

      // Increment reviewCount for selected
      for (const pick of result.selected) {
        const reviewer = freshConfig.reviewers.find(r => r.github === pick.github);
        if (reviewer) {
          reviewer.reviewCount = (reviewer.reviewCount || 0) + 1;
          reviewer.lastReviewDate = new Date().toISOString().split('T')[0];
        }
      }

      if (didReset) {
        freshConfig._lastReset = new Date().toISOString().split('T')[0];
      }
      writeConfig(freshConfig);

      const complexityLabel = complexity === 'complexo' ? '🔴 Complexo' : complexity === 'moderado' ? '🟡 Moderado' : '🟢 Simples';
      const output = {
        complexity: { label: complexityLabel, value: complexity },
        selected: result.selected.map(r => ({
          name: r.name,
          email: r.email,
          github: r.github,
          seniority: r.seniority,
          weight: r.finalWeight,
          reviewCount: (freshConfig.reviewers.find(fr => fr.github === r.github) || {}).reviewCount || 0,
        })),
        algorithm: {
          totalEligible: eligible.length,
          weights: weighted.map(r => ({ name: r.name, weight: r.finalWeight, seniority: r.seniority })),
        },
        reset: didReset,
      };

      console.log(JSON.stringify(output, null, 2));
    } finally {
      releaseLock();
    }
  } catch (err) {
    releaseLock();
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

main();
