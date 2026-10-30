#!/usr/bin/env node
/**
 * pipeline.js — Core do SDD Pipeline.
 *
 * Gerencia estado, seleção de agentes, fases e relatórios do pipeline.
 * O pipeline.md (commando /pipeline) delega operações de dados para este script
 * e mantém apenas as instruções de orquestração de agentes.
 *
 * Uso (CLI):
 *   node .opencode/scripts/pipeline.js state create <slug> <descricao>
 *   node .opencode/scripts/pipeline.js state load <slug>
 *   node .opencode/scripts/pipeline.js state save <path> <json>
 *   node .opencode/scripts/pipeline.js state resume <slug>
 *   node .opencode/scripts/pipeline.js select-agent <projeto> <camada>
 *   node .opencode/scripts/pipeline.js phase <phaseId>
 *   node .opencode/scripts/pipeline.js report <path>
 *   node .opencode/scripts/pipeline.js gate-eval <tlStatus> <qaValid>
 *
 * API (require):
 *   const pipeline = require('./.opencode/scripts/pipeline.js');
 *   pipeline.selectAgent('meu-projeto', 'backend'); // → 'backend-dev'
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PLANS_DIR = path.join(PROJECT_ROOT, '.opencode', 'plans');
const PIPELINE_RULES_PATH = path.join(PROJECT_ROOT, '.opencode', 'config', 'pipeline-rules.json');

// ─── State Schema (para validação de pipeline-state-*.json) ──────────────────

const STATE_SCHEMA = {
  type: 'object',
  required: ['tipo', 'slug', 'descricao', 'projeto', 'fase_atual', 'status', 'artefatos', 'created_at', 'updated_at'],
  properties: {
    tipo: { type: 'string', pattern: '^pipeline_state$' },
    slug: { type: 'string', minLength: 1 },
    descricao: { type: 'string', minLength: 1 },
    task_id: { type: 'string', default: '' },
    projeto: { type: 'string', minLength: 1 },
    ado_project: { type: ['string', 'null'], default: null },
    fase_atual: { type: 'string', minLength: 1 },
    status: { type: 'string', enum: ['in_progress', 'completed'] },
    artefatos: { type: 'object' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadRules() {
  if (!fs.existsSync(PIPELINE_RULES_PATH)) {
    throw new Error(`Pipeline rules não encontrado: ${PIPELINE_RULES_PATH}`);
  }
  return JSON.parse(fs.readFileSync(PIPELINE_RULES_PATH, 'utf-8'));
}

function plansDir() {
  if (!fs.existsSync(PLANS_DIR)) {
    fs.mkdirSync(PLANS_DIR, { recursive: true });
  }
  return PLANS_DIR;
}

function statePath(slug) {
  return path.join(plansDir(), `pipeline-state-${slug}.json`);
}

// ─── 1. State Management ────────────────────────────────────────────────────

/**
 * Cria estado inicial do pipeline.
 * @param {string} slug
 * @param {string} descricao
 * @param {string} [task_id]
 * @param {string} [projeto]
 * @param {string|null} [ado_project]
 * @returns {Object} state
 */
function createState(slug, descricao, task_id = '', projeto = 'workbench', ado_project = null) {
  const now = new Date().toISOString();
  return {
    tipo: 'pipeline_state',
    slug,
    descricao,
    task_id,
    projeto,
    ado_project,
    fase_atual: '0',
    status: 'in_progress',
    artefatos: {},
    created_at: now,
    updated_at: now,
  };
}

/**
 * Carrega estado do pipeline de arquivo.
 * @param {string} slug
 * @returns {Object|null} state ou null se não existir
 */
function loadState(slug) {
  const filePath = statePath(slug);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Salva estado do pipeline em arquivo.
 * @param {Object} state
 */
function saveState(state) {
  state.updated_at = new Date().toISOString();
  const filePath = statePath(state.slug);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
  return filePath;
}

/**
 * Atualiza um campo do estado e salva.
 * @param {Object} state
 * @param {string} fase
 * @param {string} artefatoKey
 * @param {Object} artefatoVal
 */
function updateArtefato(state, fase, artefatoKey, artefatoVal) {
  state.fase_atual = fase;
  state.artefatos[artefatoKey] = artefatoVal;
  return saveState(state);
}

/**
 * Verifica se há pipeline anterior e retorna prompt de retomada.
 * @param {string} slug
 * @returns {Object} { exists: boolean, state: Object|null, prompt: string|null }
 */
function resumePrompt(slug) {
  const state = loadState(slug);
  if (!state) return { exists: false, state: null, prompt: null };

  if (state.status === 'completed') {
    return {
      exists: true,
      state,
      prompt: `Pipeline anterior encontrado (já concluído na fase ${state.fase_atual}). Deseja recomeçar do zero?`,
    };
  }

  return {
    exists: true,
    state,
    prompt: `Pipeline anterior encontrado (parou na fase ${state.fase_atual}). Deseja retomar de onde parou ou começar do zero?`,
  };
}

// ─── 2. Agent Selection ─────────────────────────────────────────────────────

/**
 * Seleciona agente conforme projeto e camada.
 * Usa pipeline-rules.json#agentes_por_projeto.
 *
 * @param {string} project - Nome do projeto registrado em project-mapping.json
 * @param {string} layer - Camada: 'banco' | 'backend' | 'frontend'
 * @returns {string|null} Nome do subagent_type ou null se não mapeado
 */
function selectAgent(project, layer) {
  const rules = loadRules();
  const projectMap = rules.agentes_por_projeto[project] || rules.agentes_por_projeto.default;
  return projectMap ? (projectMap[layer] || null) : null;
}

/**
 * Resolve lista de agentes para um módulo da spec.
 * @param {Object} modulo - { nome, camada }
 * @param {string} project
 * @returns {string|null}
 */
function resolveAgentForModule(modulo, project) {
  const layerMap = {
    migrations: 'banco',
    models: 'backend',
    repository: 'backend',
    services: 'backend',
    controller: 'backend',
    routes: 'backend',
    frontend: 'frontend',
    formulario: 'frontend',
    modais: 'frontend',
  };
  const layer = layerMap[modulo.camada] || modulo.camada;
  return selectAgent(project, layer);
}

// ─── 3. Phase Config ────────────────────────────────────────────────────────

/**
 * Retorna configuração de uma fase do pipeline.
 * @param {string} phaseId - Id da fase (ex: '1.1', '2.1')
 * @returns {Object|null}
 */
function getPhaseConfig(phaseId) {
  const rules = loadRules();
  return rules.fases.find(f => f.id === phaseId) || null;
}

/**
 * Retorna lista de fases em ordem, ignorando as opcionais se skipOptional=true.
 * @param {boolean} [skipOptional]
 * @returns {Array}
 */
function getPhases(skipOptional = false) {
  const rules = loadRules();
  return skipOptional ? rules.fases.filter(f => !f.opcional) : rules.fases;
}

// ─── 4. Gate Evaluation ────────────────────────────────────────────────────

const GATE_MATRIX = {
  approved:          { blocked: 'blocked', needs_changes: 'needs_changes', approved: 'approved' },
  needs_changes:     { blocked: 'blocked', needs_changes: 'needs_changes', approved: 'approved_with_warning' },
  blocked:           { blocked: 'blocked', blocked: 'blocked', blocked: 'blocked' },
  failed:            { blocked: 'blocked', failed: 'blocked', failed: 'approved_with_warning' },
};

/**
 * Avalia resultado do gate (tech-lead + qa-engineer).
 *
 * @param {Object} techLead - { status: 'approved'|'needs_changes'|'blocked'|'failed' }
 * @param {Object} qa - { ok: boolean } ou com falha
 * @returns {{ status: string, acao: string }}
 */
function evaluateGate(techLead, qa) {
  const tlStatus = techLead.status || 'failed';
  const qaStatus = qa.ok === false ? 'blocked' : (qa.status || 'approved');

  const matrixKey = GATE_MATRIX[tlStatus] || GATE_MATRIX.failed;
  const result = matrixKey[qaStatus] || 'blocked';

  const acoes = {
    approved: '✅ Avança para Fase 3',
    needs_changes: '⚠️ Avança com ressalva (issues leves)',
    approved_with_warning: '⚠️ Avança com warning (um revisor falhou)',
    blocked: '🔴 Pausa pipeline — issues GRAVES ou gate indeterminado',
  };

  return { status: result, acao: acoes[result] || acoes.blocked };
}

// ─── 5. Report Generation ───────────────────────────────────────────────────

/**
 * Gera relatório final de sucesso.
 * @param {Object} state
 * @param {Object} stats - { totalModulos, concluidos, testesPassando, gateIssues }
 * @returns {string}
 */
function generateSuccessReport(state, stats = {}) {
  const s = stats;
  return [
    '╔═══════════════════════════════════════════════════════════╗',
    '║  SDD Pipeline — Relatório Final                          ║',
    '╠═══════════════════════════════════════════════════════════╣',
    `║  Feature:   ${state.descricao.padEnd(47)}║`,
    `║  Spec:      specs/spec-${state.slug}.md`.padEnd(55) + '║',
    '║                                                           ║',
    '║  FASE 1 — Especificação                          ✅ ok    ║',
    '║  FASE 2 — Validação (Gate)                       ✅ ok    ║',
    `║    ├── Issues:                ${s.gateIssues || 0} ${(s.gateIssues || 0) > 0 ? 'leves' : 'nenhuma'}            ║`,
    '║                                                           ║',
    '║  FASE 3 — Execução                                ✅ ok    ║',
    `║    ├── Módulos:               ${s.concluidos || '?'}/${s.totalModulos || '?'} concluídos          ║`,
    `║    ├── Testes:                ${s.testesPassando || '?'} passando                ║`,
    '║                                                           ║',
    '║  FASE 4 — Finalização                            ✅ ok    ║',
    '║                                                           ║',
    '╚═══════════════════════════════════════════════════════════╝',
  ].join('\n');
}

/**
 * Gera relatório parcial (para pipeline interrompido).
 * @param {Object} state
 * @param {string} motivo
 * @param {string} faseInterrompida
 * @returns {string}
 */
function generatePartialReport(state, motivo, faseInterrompida) {
  return [
    '╔═══════════════════════════════════════════════════════════╗',
    '║  SDD Pipeline — Relatório Parcial                        ║',
    '╠═══════════════════════════════════════════════════════════╣',
    `║  Feature:   ${state.descricao.padEnd(47)}║`,
    `║  Status:    PARCIAL — interrompido em ${faseInterrompida}`.padEnd(55) + '║',
    `║  Motivo:    ${motivo.padEnd(47)}║`,
    '║                                                           ║',
    `║  FASE 1 — Especificação              ${state.artefatos.spec ? '✅ ok' : '⏳ N/A'}    ║`,
    `║  FASE 2 — Validação (Gate)           ${state.artefatos.gate_tech_lead ? '✅ ok' : '⏳ N/A'}    ║`,
    `║  FASE 3 — Execução                   ${state.artefatos.execucao ? '⚠️ parcial' : '⏳ N/A'}    ║`,
    `║  FASE 4 — Finalização                ⏳ N/A    ║`,
    '║                                                           ║',
    `║  Checkpoint:  .opencode/plans/pipeline-state-${state.slug}.json`.padEnd(55) + '║',
    '║  Próximo passo: ' + (
      faseInterrompida.startsWith('2') ? 'Corrigir spec e re-validar' :
      faseInterrompida.startsWith('3') ? 'Reformular módulo pendente' :
      'Reiniciar pipeline'
    ).padEnd(44) + '║',
    '╚═══════════════════════════════════════════════════════════╝',
  ].join('\n');
}

// ─── 6. Feature Generator ───────────────────────────────────────────────────

/**
 * Gera conteúdo markdown para arquivo de feature.
 * @param {Object} analise - { titulo, descricao, criterios_aceite, stakeholders, riscos, notas_tecnicas }
 * @returns {string}
 */
function generateFeatureContent(analise) {
  const criterios = (analise.criterios_aceite || [])
    .map(c => `- [ ] **${c}**`)
    .join('\n');
  const stakeholders = (analise.stakeholders || [])
    .map(s => `- ${s}`)
    .join('\n');
  const riscos = (analise.riscos || [])
    .map(r => `- ${r}`)
    .join('\n');

  return [
    `# Feature: ${analise.titulo}`,
    '',
    '## Descrição',
    '',
    analise.descricao || '',
    '',
    '## Critérios de Aceite',
    '',
    criterios || '- Nenhum critério definido',
    '',
    '## Stakeholders',
    '',
    stakeholders || '- Não definido',
    '',
    '## Riscos',
    '',
    riscos || '- Não mapeados',
    '',
    '## Notas Técnicas',
    '',
    analise.notas_tecnicas || '- Nenhuma',
    '',
  ].join('\n');
}

// ─── 7. State Validation ──────────────────────────────────────────────────────

/**
 * Valida 1 estado de pipeline contra o schema.
 * @param {Object} state
 * @param {string} [source] - Identificador da fonte para mensagens de erro.
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateState(state, source) {
  const errors = [];
  const label = source ? `[${source}] ` : '';
  if (state.tipo !== 'pipeline_state') errors.push(`${label}tipo DEVE ser "pipeline_state"`);
  if (!['in_progress', 'completed'].includes(state.status)) errors.push(`${label}status inválido: "${state.status}"`);
  for (const f of ['slug', 'descricao', 'projeto', 'fase_atual']) {
    if (typeof state[f] !== 'string' || !state[f].trim()) errors.push(`${label}${f} DEVE ser string não vazia`);
  }
  for (const f of ['created_at', 'updated_at']) {
    if (typeof state[f] !== 'string' || isNaN(Date.parse(state[f]))) errors.push(`${label}${f} não é ISO date válido`);
  }
  if (state.status === 'completed' && state.artefatos) {
    for (const [k, v] of Object.entries(state.artefatos)) {
      if (v && v.status === 'pending') errors.push(`${label}artefato "${k}" está "pending" mas pipeline "completed"`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Escaneia todos os pipeline-state-*.json em .opencode/plans/.
 * @returns {{ ok: boolean, errors: string[], files: number, passed: number, failed: number }}
 */
function validateAllStates() {
  if (!fs.existsSync(PLANS_DIR)) return { ok: true, errors: [], files: 0, passed: 0, failed: 0 };
  const errors = []; let files = 0, passed = 0, failed = 0;
  for (const entry of fs.readdirSync(PLANS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    files++;
    try {
      const state = JSON.parse(fs.readFileSync(path.join(PLANS_DIR, entry.name), 'utf-8'));
      const r = validateState(state, entry.name);
      r.ok ? passed++ : (failed++, errors.push(...r.errors));
    } catch (e) { failed++; errors.push(`[${entry.name}] Erro ao ler JSON: ${e.message}`); }
  }
  return { ok: errors.length === 0, errors, files, passed, failed };
}

function getSchema() { return STATE_SCHEMA; }

// ─── CLI ─────────────────────────────────────────────────────────────────────

function cli(args = process.argv.slice(2)) {
  const command = args[0];

  if (!command || command === '--help') {
    console.log(`
  pipeline.js — Core do SDD Pipeline

  Comandos:
    state create <slug> <descricao> [task_id] [projeto]
    state load <slug>
    state resume <slug>
    select-agent <projeto> <camada>
    phase <phaseId>
    phases [--skip-optional]
    gate-eval <tl-status> <qa-ok>
    report success <path>
    report partial <path> <motivo> <fase>
    feature-gen <json>
    validate [<path>]        Valida 1 state ou escaneia .opencode/plans/
    schema                   Output do schema de validação

  Exemplos:
    node .opencode/scripts/pipeline.js select-agent meu-projeto backend
    node .opencode/scripts/pipeline.js phase 1.1
    node .opencode/scripts/pipeline.js gate-eval approved true
`);
    return;
  }

  try {
    // ── state ──────────────────────────────────────────────────────
    if (command === 'state') {
      const sub = args[1];
      if (sub === 'create') {
        const state = createState(args[2], args[3], args[4] || '', args[5] || 'workbench');
        const filePath = saveState(state);
        console.log(JSON.stringify({ state, filePath }, null, 2));
        return;
      }
      if (sub === 'load') {
        const state = loadState(args[2]);
        if (!state) { process.stderr.write(`ERRO: State "${args[2]}" não encontrado\n`); process.exit(1); }
        console.log(JSON.stringify(state, null, 2));
        return;
      }
      if (sub === 'resume') {
        const result = resumePrompt(args[2]);
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      process.stderr.write(`ERRO: Subcomando state inválido: "${sub}". Use: create, load, resume\n`);
      process.exit(1);
    }

    // ── select-agent ───────────────────────────────────────────────
    if (command === 'select-agent') {
      const agent = selectAgent(args[1], args[2]);
      console.log(JSON.stringify({ project: args[1], layer: args[2], agent }, null, 2));
      return;
    }

    // ── phase ──────────────────────────────────────────────────────
    if (command === 'phase') {
      const config = getPhaseConfig(args[1]);
      if (!config) { process.stderr.write(`ERRO: Fase "${args[1]}" não encontrada\n`); process.exit(1); }
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    // ── phases ─────────────────────────────────────────────────────
    if (command === 'phases') {
      const skipOptional = args.includes('--skip-optional');
      const phases = getPhases(skipOptional);
      console.log(JSON.stringify(phases, null, 2));
      return;
    }

    // ── gate-eval ──────────────────────────────────────────────────
    if (command === 'gate-eval') {
      const tlStatus = args[1] || 'failed';
      const qaOk = args[2] === 'true';
      const result = evaluateGate({ status: tlStatus }, { ok: qaOk });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // ── report ─────────────────────────────────────────────────────
    if (command === 'report') {
      const sub = args[1];
      const statePath = args[2];
      if (!statePath) { process.stderr.write('ERRO: report requer path do state\n'); process.exit(1); }
      const state = JSON.parse(fs.readFileSync(path.resolve(PROJECT_ROOT, statePath), 'utf-8'));

      if (sub === 'success') {
        console.log(generateSuccessReport(state));
        return;
      }
      if (sub === 'partial') {
        console.log(generatePartialReport(state, args[3] || 'Interrompido', args[4] || '?'));
        return;
      }
      process.stderr.write(`ERRO: Subcomando report inválido: "${sub}". Use: success, partial\n`);
      process.exit(1);
    }

    if (command === 'validate') {
      const targetPath = args[1];
      if (targetPath) {
        const abs = path.resolve(PROJECT_ROOT, targetPath);
        if (!fs.existsSync(abs)) { process.stderr.write(`ERRO: Arquivo não encontrado: ${targetPath}\n`); process.exit(1); }
        const state = JSON.parse(fs.readFileSync(abs, 'utf-8'));
        const r = validateState(state, targetPath);
        if (r.ok) { process.stdout.write('✅ Pipeline state validation passed.\n'); process.exit(0); }
        else { r.errors.forEach(e => process.stderr.write(`❌ ${e}\n`)); process.exit(1); }
      } else {
        const r = validateAllStates();
        if (r.ok) { process.stdout.write(`✅ Pipeline state validation passed. (${r.files} files, ${r.passed} passed)\n`); process.exit(0); }
        else { process.stderr.write(`❌ ${r.failed}/${r.files} errors\n`); r.errors.forEach(e => process.stderr.write(`   ${e}\n`)); process.exit(1); }
      }
      return;
    }

    if (command === 'schema') { console.log(JSON.stringify(STATE_SCHEMA, null, 2)); return; }

    process.stderr.write(`ERRO: Comando desconhecido "${command}". Use: state, select-agent, phase, phases, gate-eval, report, validate, schema\n`);
    process.exit(1);

  } catch (err) {
    process.stderr.write(`ERRO: ${err.message}\n`);
    process.exit(1);
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  createState, loadState, saveState, updateArtefato, resumePrompt,
  selectAgent, resolveAgentForModule,
  getPhaseConfig, getPhases,
  evaluateGate,
  generateSuccessReport, generatePartialReport,
  generateFeatureContent,
  validateState, validateAllStates, getSchema,
  cli,
};

if (require.main === module) {
  cli();
}
