#!/usr/bin/env node
'use strict';

/**
 * sprint.js — Sprint Task Definitions + Validation (unified entry point)
 *
 * Single source of truth for sprint task definitions AND all validation logic.
 * Follows the same pattern as ado.js: header JSDoc, named exports, CLI via
 * `if (require.main === module) cli()`.
 *
 * Fluxos:
 *   1. require() → getSprintTaskDefinitions() retorna array de 7 tasks
 *   2. require() → validateModule/scanForDuplicates/scanForStoryPoints/scanForBrokenReferences
 *   3. CLI → node .opencode/scripts/sprint.js [command] [flags]
 *
 * Uso (CLI):
 *   node .opencode/scripts/sprint.js definitions        # output JSON das tasks
 *   node .opencode/scripts/sprint.js validate            # = --check (default)
 *   node .opencode/scripts/sprint.js module-only         # só validateModule
 *   node .opencode/scripts/sprint.js duplicates-only     # só scanForDuplicates
 *   node .opencode/scripts/sprint.js story-points-only   # só scanForStoryPoints
 *   node .opencode/scripts/sprint.js broken-refs-only    # só scanForBrokenReferences
 *   node .opencode/scripts/sprint.js check               # = --check
 *   node .opencode/scripts/sprint.js --json              # output JSON
 *
 * API (require):
 *   const { getSprintTaskDefinitions, validateModule } = require('./scripts/sprint.js');
 *
 * Regras de negócio (task definitions):
 *   R1: Tasks condicionais (FE, BE, DB) NUNCA têm OE/RW preenchidos
 *   R2: Tasks fixas têm OE=RW padronizados
 *   R3: Database é SEMPRE 1 task única
 *   R4: Story Points NÃO são usados
 *   R5: WorkedTime=0 em TODAS as tasks
 *   R6: Activity obrigatório (Development | Testing)
 */

const fs = require('fs');
const path = require('path');

// ─── Project root ────────────────────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const FLOW_CONFIG_PATH = path.join(PROJECT_ROOT, '.opencode', 'config', 'git-sprint-flow-rules.json');

// ─── Task Definitions (carregado de config/sprint-rules.json) ────────────────
const SPRINT_RULES_PATH = path.join(PROJECT_ROOT, '.opencode', 'config', 'sprint-rules.json');

/**
 * Array de 7 tasks de sprint (3 condicionais + 4 fixas).
 * Schema: { title, activity, oe, rw, workedTime, tipo, condicao, ordem, descricaoCurta }
 * Tasks fixas: sempre criadas, oe/rw preenchidos (número).
 * Tasks condicionais: criadas apenas se houver evidência, oe/rw = null.
 *
 * @see .opencode/config/sprint-rules.json
 * @type {Array<{title: string, activity: string, oe: number|null, rw: number|null, workedTime: number, tipo: string, condicao: string, ordem: number, descricaoCurta: string}>}
 */
const TASKS = JSON.parse(fs.readFileSync(SPRINT_RULES_PATH, 'utf-8')).tasks;

// ─── getSprintTaskDefinitions ────────────────────────────────────────────────

/**
 * Retorna o array de definições de tasks de sprint.
 * @returns {Array<object>} Array de 7 tasks (3 condicionais + 4 fixas).
 */
function getSprintTaskDefinitions() {
  return TASKS;
}

// ─── Required fields per task definition ─────────────────────────────────────
const REQUIRED_FIELDS = [
  'title', 'activity', 'oe', 'rw', 'workedTime',
  'tipo', 'condicao', 'ordem', 'descricaoCurta'
];

// ─── Exclusion patterns para arquivos de documentação ────────────────────────

/**
 * Diretórios com documentação/spec histórica onde @.opencode/ aparece como
 * exemplo, não como referência funcional. Excluídos dos checks de integridade.
 */
const EXCLUDED_DOC_PREFIXES = [
  path.join('.opencode', 'knowledge'),
  path.join('.opencode', 'backlog', 'adr'),
  path.join('.opencode', 'scripts', 'tests', 'fixtures'),
  path.join('.opencode', 'plans'),
];

/**
 * Verifica se um caminho relativo deve ser excluído dos checks.
 * @param {string} relPathWithNormalized - Caminho relativo com / como separador.
 * @returns {boolean}
 */
function isExcludedDocFile(relPath) {
  return EXCLUDED_DOC_PREFIXES.some(prefix =>
    relPath.startsWith(prefix.replace(/\\/g, '/')));
}

// ─── Utility: recursive .md file finder ──────────────────────────────────────

/**
 * Recursively finds all .md files under a directory.
 * If `target` is an existing file, returns just that file.
 *
 * @param {string} dirOrFile - Directory to scan or a specific file path.
 * @returns {string[]} Array of absolute file paths.
 */
function findMdFiles(dirOrFile) {
  // If it's a specific existing file, return it directly
  if (fs.existsSync(dirOrFile) && fs.statSync(dirOrFile).isFile()) {
    return [dirOrFile];
  }

  if (!fs.existsSync(dirOrFile)) return [];

  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }

  walk(dirOrFile);
  return results;
}

// ─── 1. validateModule ───────────────────────────────────────────────────────

/**
 * Carrega as definições de tasks (de sprint-rules.json ou de um path custom) e valida schema, tipos e regras de negócio.
 * Se modulePath não for fornecido, valida o TASKS vindo de sprint-rules.json.
 * @param {string} [modulePath] - Caminho absoluto opcional (para testes com fixtures).
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateModule(modulePath) {
  const errors = [];

  let tasks;

  if (modulePath) {
    // External module path provided (e.g. for tests or config/ module)
    try {
      // Use a unique cache-busting key so tests with different paths work
      delete require.cache[require.resolve(modulePath)];
      tasks = require(modulePath);
    } catch (err) {
      return { ok: false, errors: [`Módulo não encontrado: ${modulePath} — ${err.message}`] };
    }
  } else {
    // Use TASKS de sprint-rules.json (default)
    tasks = TASKS;
  }

  // Array com exatamente 7 itens
  if (!Array.isArray(tasks)) {
    return { ok: false, errors: ['Módulo não exporta um array'] };
  }
  if (tasks.length !== 7) {
    errors.push(`Array deve ter exatamente 7 itens, encontrado ${tasks.length}`);
  }

  // Cada item deve ter os 9 campos obrigatórios
  tasks.forEach((task, i) => {
    const missing = REQUIRED_FIELDS.filter(f => !(f in task));
    if (missing.length > 0) {
      errors.push(`Item ${i} ("${task.title || '?'}") campos faltando: ${missing.join(', ')}`);
    }
  });

  // 3 condicionais com oe/rw === null
  const condicionais = tasks.filter(t => t.tipo === 'condicional');
  if (condicionais.length !== 3) {
    errors.push(`Devem existir 3 tasks condicionais, encontrado ${condicionais.length}`);
  }
  condicionais.forEach((t) => {
    if (t.oe !== null) errors.push(`Condicional "${t.title}" — oe deve ser null, encontrado: ${t.oe}`);
    if (t.rw !== null) errors.push(`Condicional "${t.title}" — rw deve ser null, encontrado: ${t.rw}`);
  });

  // 4 fixas com oe/rw como números
  const fixas = tasks.filter(t => t.tipo === 'fixa');
  if (fixas.length !== 4) {
    errors.push(`Devem existir 4 tasks fixas, encontrado ${fixas.length}`);
  }
  fixas.forEach((t) => {
    if (typeof t.oe !== 'number') errors.push(`Fixa "${t.title}" — oe deve ser número, encontrado: ${typeof t.oe}`);
    if (typeof t.rw !== 'number') errors.push(`Fixa "${t.title}" — rw deve ser número, encontrado: ${typeof t.rw}`);
  });

  // Database = exatamente 1 task
  const dbTasks = tasks.filter(t => (t.title || '').toLowerCase().includes('database'));
  if (dbTasks.length !== 1) {
    errors.push(`Deve existir exatamente 1 task de Database, encontrado ${dbTasks.length}`);
  }

  // Story Points NÃO pode aparecer em nenhum campo
  const storyPointsRegex = /story\s*points/i;
  tasks.forEach((task, i) => {
    Object.entries(task).forEach(([key, value]) => {
      if (typeof value === 'string' && storyPointsRegex.test(value)) {
        errors.push(`Item ${i} ("${task.title}") campo "${key}" contém referência a "Story Points"`);
      }
    });
  });

  return { ok: errors.length === 0, errors };
}

// ─── 2. scanForDuplicates ────────────────────────────────────────────────────

/**
 * Procura arquivos .md que contenham tabela markdown literal com as tasks
 * de sprint (refatoração incompleta). Tasks devem ser referenciadas via CLI.
 *
 * @param {string} [filePattern] - Diretório ou arquivo para escanear.
 * @param {boolean} [skipExcluded] - Se true, não aplica exclusão de docs.
 * @returns {{ ok: boolean, errors: string[] }}
 */
function scanForDuplicates(filePattern, skipExcluded) {
  const scanDir = filePattern || path.join(PROJECT_ROOT, '.opencode');
  const files = findMdFiles(scanDir);
  const errors = [];

  // Regex: linhas de tabela markdown com títulos das tasks
  const taskRowRegex = /^\|\s*\d+\s*\|.*(?:Frontend|Backend|Database|Code Review|Task Owner|PM Validation|Testing)/im;
  // Linhas específicas para detecção combinada
  const frontendCondRow = /^\|\s*\d+\s*\|.*Frontend.*Condicional/im;
  const codeReviewFixaRow = /^\|\s*\d+\s*\|.*Code Review.*Fixa/im;

  for (const file of files) {
    const relPath = path.relative(PROJECT_ROOT, file).replace(/\\/g, '/');

    // Pula docs/knowledge a menos que skipExcluded=true (usado por testes com fixtures)
    if (!skipExcluded && isExcludedDocFile(relPath)) continue;

    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    // Conta linhas de tabela que contêm títulos de tasks
    const tableLines = [];
    for (let i = 0; i < lines.length; i++) {
      if (taskRowRegex.test(lines[i])) {
        tableLines.push(i + 1);
      }
    }

    // Precisa de pelo menos 4 linhas de tabela para ser considerado duplicata
    const hasLiteralTable = tableLines.length >= 4;

    // Verificação adicional: precisa ter pelo menos uma Frontend+Condicional
    // OU uma Code Review+Fixa para confirmar que é a tabela de sprint tasks
    const hasFrontendCond = frontendCondRow.test(content);
    const hasCodeReviewFixa = codeReviewFixaRow.test(content);
    const hasSpecificRows = hasFrontendCond || hasCodeReviewFixa;

    if (hasLiteralTable && hasSpecificRows) {
      errors.push(`${relPath}:${tableLines.join(',')} — tabela literal de tasks encontrada (deve usar CLI: sprint.js definitions)`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// ─── 3. scanForStoryPoints ───────────────────────────────────────────────────

/**
 * Conta ocorrências de "Story Points" em .md do vault, excluindo o ADR-004.
 *
 * @param {string} [filePattern] - Diretório ou arquivo para escanear.
 * @param {boolean} [skipExcluded] - Se true, não aplica exclusão de docs.
 * @returns {{ ok: boolean, errors: string[], count: number }}
 */
function scanForStoryPoints(filePattern, skipExcluded) {
  const scanDir = filePattern || path.join(PROJECT_ROOT, '.opencode');
  const files = findMdFiles(scanDir);
  const errors = [];
  let totalCount = 0;

  const excludedFile = path.join('.opencode', 'backlog', 'adr', 'ADR-004-sprint-tasks.md').replace(/\\/g, '/');

  for (const file of files) {
    const relPath = path.relative(PROJECT_ROOT, file).replace(/\\/g, '/');

    // Exclui ADR-004 + docs/specs/knowledge/fixtures
    if (relPath === excludedFile) continue;
    // Pula docs/knowledge a menos que skipExcluded=true (usado por testes com fixtures)
    if (!skipExcluded && isExcludedDocFile(relPath)) continue;

    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const regex = /story\s*points/i;

    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        totalCount++;
        errors.push(`${relPath}:${i + 1} — "${lines[i].trim()}"`);
      }
    }
  }

  return { ok: totalCount === 0, errors, count: totalCount };
}

// ─── 4. scanForBrokenReferences ──────────────────────────────────────────────

/**
 * Extrai todos os @.opencode/<path> de .md e verifica se o arquivo existe.
 * Skills (shorthand) são ignoradas — apenas configs e ADRs são validados.
 *
 * @param {string} [filePattern] - Diretório ou arquivo para escanear.
 * @param {boolean} [skipExcluded] - Se true, não aplica exclusão de docs.
 * @returns {{ ok: boolean, errors: string[] }}
 */
function scanForBrokenReferences(filePattern, skipExcluded) {
  const scanDir = filePattern || path.join(PROJECT_ROOT, '.opencode');
  const files = findMdFiles(scanDir);
  const errors = [];

  const refRegex = /@\.opencode\/(\S+)/;
  const trailingPunctRegex = /[.,;:!?)]+$/;

  for (const file of files) {
    const relPath = path.relative(PROJECT_ROOT, file).replace(/\\/g, '/');

    // Pula docs/knowledge a menos que skipExcluded=true (usado por testes com fixtures)
    if (!skipExcluded && isExcludedDocFile(relPath)) continue;

    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Pula linhas com @.opencode/ dentro de backticks (exemplos de path, não refs funcionais)
      if (/`@\.opencode\//.test(line)) continue;
      const match = line.match(refRegex);
      if (match) {
        let refPath = match[1];
        // Remove trailing punctuation
        refPath = refPath.replace(trailingPunctRegex, '');
        // Skills usam shorthand (@.opencode/skills/<nome>), path real é diferente — pula
        if (refPath.startsWith('skills/')) continue;
        // Caminhos relativos ao .opencode/
        const absolutePath = path.resolve(PROJECT_ROOT, '.opencode', refPath);
        if (!fs.existsSync(absolutePath)) {
          errors.push(`${relPath}:${i + 1} — @.opencode/${refPath} (arquivo não existe)`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// ─── Flow functions (do git-sprint-flow) ─────────────────────────────────────

/**
 * Valida nome da branch de sprint.
 * @param {string} branch
 * @returns {{ valid: boolean, pattern: string, error?: string }}
 */
function validateSprintBranch(branch) {
  const pattern = 'feat/TASK-XXXX'.replace('XXXX', '\\d+');
  const regex = new RegExp(`^${pattern}$`);
  if (regex.test(branch)) return { valid: true, pattern: 'feat/TASK-XXXX' };
  return { valid: false, pattern: 'feat/TASK-XXXX', error: `Branch "${branch}" não segue padrão "feat/TASK-XXXX"` };
}

/**
 * Retorna comandos de quality gate para um projeto (sprint mode).
 * @param {string} project
 * @returns {Object}
 */
function getQualityGateCmd(project) {
  if (!fs.existsSync(FLOW_CONFIG_PATH)) return { lint: null, sast: null, security: null };
  const config = JSON.parse(fs.readFileSync(FLOW_CONFIG_PATH, 'utf-8'));
  return config.qualityGateCommands[project] || { lint: null, sast: null, security: null };
}

/**
 * Retorna árvore de decisão do quality gate (sprint mode).
 * @returns {Object}
 */
function getQualityGateDecision() {
  if (!fs.existsSync(FLOW_CONFIG_PATH)) return { gates: {}, blocking: [] };
  const config = JSON.parse(fs.readFileSync(FLOW_CONFIG_PATH, 'utf-8'));
  return {
    gates: config.qualityGates,
    blocking: Object.entries(config.qualityGates).filter(([, v]) => v.blocking).map(([k]) => k),
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

/**
 * CLI entry point. Parses argv and dispatches to the appropriate function(s).
 *
 * Commands (subcommands):
 *   definitions        — output JSON das tasks
 *   validate           — executa todas as 4 validações (default)
 *   check              — alias de validate
 *   module-only        — só validateModule
 *   duplicates-only    — só scanForDuplicates
 *   story-points-only  — só scanForStoryPoints
 *   broken-refs-only   — só scanForBrokenReferences
 *
 * Flags:
 *   --json             — saída JSON machine-readable (stdout)
 */
function cli() {
  const args = process.argv.slice(2);

  // Extract subcommand (first non-flag arg)
  const subcommand = args.find(a => !a.startsWith('--')) || null;
  const hasJsonFlag = args.includes('--json');

  // ── definitions subcommand ──────────────────────────────────────────
  if (subcommand === 'definitions') {
    process.stdout.write(JSON.stringify(getSprintTaskDefinitions(), null, 2) + '\n');
    process.exit(0);
  }

  // ── validate-branch ─────────────────────────────────────────────
  if (subcommand === 'validate-branch') {
    const branch = args[args.findIndex(a => a === 'validate-branch') + 1];
    if (!branch) { process.stderr.write('ERRO: validate-branch requer nome da branch\n'); process.exit(1); }
    process.stdout.write(JSON.stringify(validateSprintBranch(branch), null, 2) + '\n');
    process.exit(0);
  }

  // ── quality-gates ───────────────────────────────────────────────
  if (subcommand === 'quality-gates') {
    const project = args[args.findIndex(a => a === 'quality-gates') + 1];
    process.stdout.write(JSON.stringify({ project: project || '(fallback)', commands: getQualityGateCmd(project || '') }, null, 2) + '\n');
    process.exit(0);
  }

  // ── gate ────────────────────────────────────────────────────────
  if (subcommand === 'gate') {
    process.stdout.write(JSON.stringify(getQualityGateDecision(), null, 2) + '\n');
    process.exit(0);
  }

  // ── Map subcommands to validation scopes ────────────────────────────
  const scopeMap = {
    'validate':           { module: true, duplicates: true, storyPoints: true, brokenRefs: true },
    'check':              { module: true, duplicates: true, storyPoints: true, brokenRefs: true },
    'module-only':        { module: true, duplicates: false, storyPoints: false, brokenRefs: false },
    'duplicates-only':    { module: false, duplicates: true, storyPoints: false, brokenRefs: false },
    'story-points-only':  { module: false, duplicates: false, storyPoints: true, brokenRefs: false },
    'broken-refs-only':   { module: false, duplicates: false, storyPoints: false, brokenRefs: true },
  };

  // Default scope if no subcommand or unrecognized subcommand
  let scope;
  if (subcommand && scopeMap[subcommand]) {
    scope = scopeMap[subcommand];
  } else if (!subcommand) {
    // No subcommand → default: run all validations
    scope = { module: true, duplicates: true, storyPoints: true, brokenRefs: true };
  } else {
    process.stderr.write(`Unknown command: ${subcommand}\n`);
    process.stderr.write('Usage: node sprint.js [definitions|validate|check|validate-branch|quality-gates|gate|module-only|duplicates-only|story-points-only|broken-refs-only] [--json]\n');
    process.exit(1);
  }

  // ── Run validations ─────────────────────────────────────────────────
  const results = {};
  const allErrors = [];

  if (scope.module) {
    results.module = validateModule();
    allErrors.push(...results.module.errors);
  }
  if (scope.duplicates) {
    results.duplicates = scanForDuplicates();
    allErrors.push(...results.duplicates.errors);
  }
  if (scope.storyPoints) {
    results.storyPoints = scanForStoryPoints();
    allErrors.push(...results.storyPoints.errors);
  }
  if (scope.brokenRefs) {
    results.brokenRefs = scanForBrokenReferences();
    allErrors.push(...results.brokenRefs.errors);
  }

  const passed = allErrors.length === 0;

  if (hasJsonFlag) {
    const output = { passed, results };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  } else {
    if (passed) {
      process.stdout.write('✅ Sprint tasks validation passed.\n');
    } else {
      for (const err of allErrors) {
        process.stderr.write(`❌ ${err}\n`);
      }
    }
  }

  process.exit(passed ? 0 : 1);
}

// ─── Exports (testable) + CLI entry point ────────────────────────────────────

module.exports = {
  getSprintTaskDefinitions,
  validateModule,
  scanForDuplicates,
  scanForStoryPoints,
  scanForBrokenReferences,
  validateSprintBranch,
  getQualityGateCmd,
  getQualityGateDecision,
  cli
};

if (require.main === module) {
  cli();
}
