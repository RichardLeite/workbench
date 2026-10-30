const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const path = require('node:path');

const CLI = path.resolve(__dirname, '..', 'pipeline.js');
const {
  createState, loadState, saveState, resumePrompt,
  selectAgent,
  getPhaseConfig,
  evaluateGate,
  validateState, getSchema,
} = require(CLI);

function run(...args) {
  try {
    const output = execSync(`node "${CLI}" ${args.join(' ')}`, { encoding: 'utf-8' });
    return { exitCode: 0, stdout: output.trim() };
  } catch (e) {
    return { exitCode: e.status ?? 1, stdout: e.stdout?.trim() ?? '' };
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const validState = {
  tipo: 'pipeline_state',
  slug: 'spec-cliente',
  descricao: 'Criar tela de consulta',
  task_id: 'TASK-1234',
  projeto: 'workbench',
  ado_project: 'Sprint Team',
  fase_atual: '4.0',
  status: 'completed',
  artefatos: { entrevista: { status: 'done' }, spec: { status: 'done' }, execucao: { status: 'done' }, vault: { status: 'done' } },
  created_at: '2026-06-25T12:00:00Z',
  updated_at: '2026-06-25T12:30:00Z',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('pipeline.js', () => {

  describe('selectAgent', () => {
    it('should return generic backend agent for unknown project', () => {
      assert.equal(selectAgent('meu-projeto', 'backend'), 'backend-dev');
    });
    it('should fallback to default for unknown project', () => {
      assert.equal(selectAgent('unknown', 'backend'), 'backend-dev');
    });
  });

  describe('getPhaseConfig', () => {
    it('should return config for known phase', () => {
      const phase = getPhaseConfig('1.1');
      assert.equal(phase.agente, 'business-analyst');
    });
    it('should return null for unknown phase', () => {
      assert.equal(getPhaseConfig('99.9'), null);
    });
  });

  describe('evaluateGate', () => {
    it('should approve when both ok', () => {
      const r = evaluateGate({ status: 'approved' }, { ok: true });
      assert.equal(r.status, 'approved');
    });
    it('should block when tech-lead blocks', () => {
      const r = evaluateGate({ status: 'blocked' }, { ok: true });
      assert.equal(r.status, 'blocked');
    });
  });

  describe('createState and resumePrompt', () => {
    it('should create valid initial state', () => {
      const state = createState('test-slug', 'Test desc', 'TASK-1', 'workbench');
      assert.equal(state.tipo, 'pipeline_state');
      assert.equal(state.status, 'in_progress');
    });
    it('resumePrompt should return exists=false for unknown slug', () => {
      const r = resumePrompt('non-existent-slug-12345');
      assert.equal(r.exists, false);
    });
  });

  // ── State Validation ────────────────────────────────────────────────

  describe('getSchema', () => {
    it('should return schema with required fields', () => {
      const s = getSchema();
      assert.ok(s.required.includes('tipo'));
      assert.ok(s.required.includes('status'));
    });
  });

  describe('validateState', () => {
    it('should pass for valid completed state', () => {
      assert.equal(validateState(validState).ok, true);
    });
    it('should reject invalid tipo', () => {
      assert.equal(validateState({ ...validState, tipo: 'invalid' }).ok, false);
    });
    it('should reject invalid status', () => {
      assert.equal(validateState({ ...validState, status: 'unknown' }).ok, false);
    });
    it('should reject empty slug', () => {
      assert.equal(validateState({ ...validState, slug: '' }).ok, false);
    });
    it('should reject invalid ISO date', () => {
      assert.equal(validateState({ ...validState, created_at: 'not-a-date' }).ok, false);
    });
    it('should reject completed with pending artefact', () => {
      assert.equal(validateState({ ...validState, artefatos: { vault: { status: 'pending' } } }).ok, false);
    });
    it('should accept in_progress with pending artefacts', () => {
      assert.equal(validateState({ ...validState, status: 'in_progress', artefatos: { x: { status: 'pending' } } }).ok, true);
    });
  });

  describe('CLI', () => {
    it('select-agent should output JSON', () => {
      const r = run('select-agent', 'meu-projeto', 'backend');
      assert.equal(r.exitCode, 0);
      assert.equal(JSON.parse(r.stdout).agent, 'backend-dev');
    });
    it('gate-eval should output JSON', () => {
      const r = run('gate-eval', 'approved', 'true');
      assert.equal(r.exitCode, 0);
      assert.equal(JSON.parse(r.stdout).status, 'approved');
    });
    it('schema should output JSON', () => {
      const r = run('schema');
      assert.equal(r.exitCode, 0);
      assert.equal(JSON.parse(r.stdout).type, 'object');
    });
    it('validate should output result with file count', () => {
      const r = run('validate');
      assert.equal(r.exitCode, 0);
      assert.ok(r.stdout.includes('passed'), `stdout deve conter "passed": ${r.stdout}`);
      assert.ok(r.stdout.includes('files'), `stdout deve conter "files": ${r.stdout}`);
    });
    it('phase should output config', () => {
      const r = run('phase', '1.1');
      assert.equal(r.exitCode, 0);
      assert.equal(JSON.parse(r.stdout).agente, 'business-analyst');
    });
  });
});
