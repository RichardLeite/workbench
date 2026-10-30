#!/usr/bin/env node
/**
 * hotfix.js — Central de validação e orquestração de hotfix.
 *
 * Lê git-hotfix-flow-rules.json (validação + quality gates + PRs).
 * CLI único para validação de branches, cherry-pick, PR count e quality gates.
 *
 * Uso (CLI):
 *   node .opencode/scripts/hotfix.js config                          → regras de hotfix
 *   node .opencode/scripts/hotfix.js validate-branch <branch>        → valida branch main
 *   node .opencode/scripts/hotfix.js validate-release <branch>       → valida branch release
 *   node .opencode/scripts/hotfix.js validate-cherry-pick <sha...> -- <sha...>
 *   node .opencode/scripts/hotfix.js validate-pr-count <N>
 *   node .opencode/scripts/hotfix.js quality-gates <project>         → comandos QA
 *   node .opencode/scripts/hotfix.js gate                             → árvore de decisão QA
 *   node .opencode/scripts/hotfix.js pr-config                       → config de PRs
 *   node .opencode/scripts/hotfix.js check                           → valida tudo
 */

'use strict';

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'config', 'git-hotfix-flow-rules.json');
const FLOW_CONFIG_PATH = path.join(PROJECT_ROOT, 'config', 'git-hotfix-flow-rules.json');

// ─── Config loaders ───────────────────────────────────────────────────────────

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) throw new Error(`Config não encontrado: ${CONFIG_PATH}`);
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function loadFlowConfig() {
  if (!fs.existsSync(FLOW_CONFIG_PATH)) return null;
  return JSON.parse(fs.readFileSync(FLOW_CONFIG_PATH, 'utf-8'));
}

// ─── Validators (core) ────────────────────────────────────────────────────────

function validateHotfixBranch(branchName) {
  const config = loadConfig();
  const pattern = config.branchPattern.replace('XXXX', '\\d+');
  const regex = new RegExp(`^${pattern}$`);
  if (regex.test(branchName)) return { valid: true, pattern: config.branchPattern };
  return { valid: false, pattern: config.branchPattern, error: `Branch "${branchName}" não segue padrão "${config.branchPattern}" (base: ${config.baseMain})` };
}

function validateReleaseBranch(branchName) {
  const config = loadConfig();
  const pattern = config.branchPatternRelease.replace('XXXX', '\\d+');
  const regex = new RegExp(`^${pattern}$`);
  if (regex.test(branchName)) return { valid: true, pattern: config.branchPatternRelease };
  return { valid: false, pattern: config.branchPatternRelease, error: `Release branch "${branchName}" não segue padrão "${config.branchPatternRelease}" (base: ${config.baseRelease})` };
}

function validateCherryPickFlow(mainCommits, releaseCommits) {
  if (!Array.isArray(mainCommits) || !Array.isArray(releaseCommits)) {
    return { valid: false, matchCount: 0, mainCount: 0, releaseCount: 0, error: 'mainCommits e releaseCommits devem ser arrays' };
  }
  const matchCount = mainCommits.filter(sha => releaseCommits.includes(sha)).length;
  if (matchCount === mainCommits.length && mainCommits.length > 0) {
    return { valid: true, matchCount, mainCount: mainCommits.length, releaseCount: releaseCommits.length };
  }
  return { valid: false, matchCount, mainCount: mainCommits.length, releaseCount: releaseCommits.length, error: `Cherry-pick incompleto: ${matchCount}/${mainCommits.length} commits da main encontrados na release` };
}

function validatePrCount(prCount, expected) {
  const config = loadConfig();
  const exp = expected !== undefined ? expected : config.prCount;
  if (prCount === exp) return { valid: true, expected: exp, actual: prCount };
  return { valid: false, expected: exp, actual: prCount, error: `Número de PRs inválido: esperado ${exp}, atual ${prCount} (hotfix deve ter ${exp} PRs: main + release)` };
}

// ─── Quality Gates (flow) ─────────────────────────────────────────────────────

function getQualityGateCommands(project) {
  const config = loadFlowConfig();
  if (!config) return { lint: null, sast: null, security: null };
  return config.qualityGateCommands[project] || { lint: null, sast: null, security: null };
}

function getGateDecision() {
  const config = loadFlowConfig();
  if (!config) return { gates: {}, blocking: [], securityBlocking: true, aiReviewBlocking: true };
  return {
    gates: config.qualityGates,
    blocking: Object.entries(config.qualityGates).filter(([, v]) => v.blocking).map(([k]) => k),
    securityBlocking: config.securityBlocking,
    aiReviewBlocking: config.aiReviewBlocking,
  };
}

function getPrConfig() {
  const config = loadFlowConfig();
  if (!config) return { prCount: 2, targets: ['main', 'release'] };
  return { prCount: config.prCount, targets: [config.prTargetMain, config.prTargetRelease] };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function cli(args = process.argv.slice(2)) {
  const command = args[0];

  if (!command || command === '--help') {
    console.log(`
  hotfix.js — Central de validação e orquestração de hotfix

  Comandos:
    config                  Output das regras de hotfix
    validate-branch <name>  Valida branch main (ex: fix/TASK-1234)
    validate-release <name> Valida branch release (ex: fix/TASK-1234-release)
    validate-cherry-pick <mainSHAs> -- <releaseSHAs>
    validate-pr-count <N>
    quality-gates <project> Comandos de quality gate para o projeto
    gate                    Árvore de decisão do quality gate
    pr-config               Configuração de PRs
    check                   Valida config

  Exemplos:
    node .opencode/scripts/hotfix.js validate-branch fix/TASK-21284
    node .opencode/scripts/hotfix.js quality-gates meu-projeto-api
`);
    return;
  }

  try {
    if (command === 'config') { console.log(JSON.stringify(loadConfig(), null, 2)); return; }
    if (command === 'validate-branch') {
      if (!args[1]) { process.stderr.write('ERRO: validate-branch requer nome da branch\n'); process.exit(1); }
      console.log(JSON.stringify(validateHotfixBranch(args[1]), null, 2)); return;
    }
    if (command === 'validate-release') {
      if (!args[1]) { process.stderr.write('ERRO: validate-release requer nome da branch\n'); process.exit(1); }
      console.log(JSON.stringify(validateReleaseBranch(args[1]), null, 2)); return;
    }
    if (command === 'validate-cherry-pick') {
      const sep = args.indexOf('--');
      if (sep < 2) { process.stderr.write('ERRO: validate-cherry-pick requer <mainSHAs> -- <releaseSHAs>\n'); process.exit(1); }
      console.log(JSON.stringify(validateCherryPickFlow(args.slice(1, sep), args.slice(sep + 1)), null, 2)); return;
    }
    if (command === 'validate-pr-count') {
      const n = parseInt(args[1], 10);
      if (isNaN(n)) { process.stderr.write('ERRO: validate-pr-count requer número\n'); process.exit(1); }
      console.log(JSON.stringify(validatePrCount(n), null, 2)); return;
    }
    if (command === 'quality-gates') {
      console.log(JSON.stringify({ project: args[1] || '(fallback)', commands: getQualityGateCommands(args[1] || '') }, null, 2)); return;
    }
    if (command === 'gate') { console.log(JSON.stringify(getGateDecision(), null, 2)); return; }
    if (command === 'pr-config') { console.log(JSON.stringify(getPrConfig(), null, 2)); return; }
    if (command === 'check') {
      const c = loadConfig();
      console.log(JSON.stringify({ config: { valid: true, projects: 1 }, expectedPrCount: c.prCount }, null, 2)); return;
    }

    process.stderr.write(`ERRO: Comando desconhecido "${command}". Use: config, validate-branch, validate-release, validate-cherry-pick, validate-pr-count, quality-gates, gate, pr-config, check\n`);
    process.exit(1);
  } catch (err) {
    process.stderr.write(`ERRO: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  loadConfig, validateHotfixBranch, validateReleaseBranch, validateCherryPickFlow, validatePrCount,
  getQualityGateCommands, getGateDecision, getPrConfig, cli,
};

if (require.main === module) { cli(); }
