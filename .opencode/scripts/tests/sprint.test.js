const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const path = require('node:path');

const CLI = path.resolve(__dirname, '..', 'sprint.js');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const {
  getSprintTaskDefinitions,
  validateModule,
  scanForDuplicates,
  scanForStoryPoints,
  scanForBrokenReferences,
  validateSprintBranch,
  getQualityGateCmd,
  getQualityGateDecision,
} = require(CLI);

// Fixture paths
const FIXTURE_DUPLICATE = path.join(FIXTURES_DIR, 'duplicate-with-table.md');
const FIXTURE_SEE_ONLY = path.join(FIXTURES_DIR, 'cli-only-no-duplicate.md');
const FIXTURE_STORY_POINTS = path.join(FIXTURES_DIR, 'story-points-occurrences.md');
const FIXTURE_BROKEN_REF = path.join(FIXTURES_DIR, 'broken-reference.md');

function run(...args) {
  try {
    const quoted = args.map(a => a.includes(' ') ? `"${a}"` : a);
    const output = execSync(`node "${CLI}" ${quoted.join(' ')}`, { encoding: 'utf-8' });
    return { exitCode: 0, stdout: output.trim() };
  } catch (e) {
    return { exitCode: e.status ?? 1, stdout: e.stdout?.trim() ?? '' };
  }
}

describe('sprint.js', () => {

  describe('getSprintTaskDefinitions', () => {
    it('should return array of 7 tasks', () => {
      const tasks = getSprintTaskDefinitions();
      assert.ok(Array.isArray(tasks));
      assert.equal(tasks.length, 7);
    });

    it('should have 3 conditionals with oe/rw null', () => {
      const tasks = getSprintTaskDefinitions();
      const cond = tasks.filter(t => t.tipo === 'condicional');
      assert.equal(cond.length, 3);
      assert.ok(cond.every(t => t.oe === null && t.rw === null));
    });

    it('should have 4 fixas with oe/rw as numbers', () => {
      const tasks = getSprintTaskDefinitions();
      const fixas = tasks.filter(t => t.tipo === 'fixa');
      assert.equal(fixas.length, 4);
      assert.ok(fixas.every(t => typeof t.oe === 'number' && typeof t.rw === 'number'));
    });
  });

  describe('CLI', () => {
    it('definitions should output JSON array of 7', () => {
      const result = run('definitions');
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.ok(Array.isArray(parsed));
      assert.equal(parsed.length, 7);
    });

    it('validate should exit 0 on clean state', () => {
      const result = run('validate');
      assert.equal(result.exitCode, 0);
    });

    it('check should exit 0 on clean state', () => {
      const result = run('check');
      assert.equal(result.exitCode, 0);
    });
  });

  // ── Validators (migrated from validate-sprint-tasks.test.js) ──────────────

  describe('validateModule', () => {
    it('should pass validating sprint-rules.json data', () => {
      const result = validateModule();
      assert.equal(result.ok, true, `Expected ok=true: ${result.errors.join('; ')}`);
      assert.equal(result.errors.length, 0);
    });

    it('should fail when module is missing (exit 1)', () => {
      const fakePath = path.resolve(__dirname, 'non-existent-module.js');
      const result = validateModule(fakePath);
      assert.equal(result.ok, false);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors[0].includes('Módulo não encontrado'));
    });
  });

  describe('scanForDuplicates', () => {
    it('should fail when file has literal task table (exit 1)', () => {
      const result = scanForDuplicates(FIXTURE_DUPLICATE, true);
      assert.equal(result.ok, false);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors[0].includes('tabela literal'));
    });

    it('should pass when file has no literal task table (exit 0)', () => {
      const result = scanForDuplicates(FIXTURE_SEE_ONLY, true);
      assert.equal(result.ok, true, `Unexpected errors: ${result.errors.join('; ')}`);
      assert.equal(result.errors.length, 0);
    });
  });

  describe('scanForStoryPoints', () => {
    it('should fail when Story Points found outside ADR-004 (exit 1)', () => {
      const result = scanForStoryPoints(FIXTURE_STORY_POINTS, true);
      assert.equal(result.ok, false);
      assert.equal(result.count, 13);
      assert.equal(result.errors.length, 13);
    });
  });

  describe('scanForBrokenReferences', () => {
    it('should fail when @.opencode/ points to non-existent file (exit 1)', () => {
      const result = scanForBrokenReferences(FIXTURE_BROKEN_REF, true);
      assert.equal(result.ok, false);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors[0].includes('arquivo não existe'));
    });
  });

  describe('validateSprintBranch', () => {
    it('should accept valid sprint branch', () => {
      const result = validateSprintBranch('feat/TASK-1234');
      assert.equal(result.valid, true);
    });
    it('should reject fix/ prefix', () => {
      assert.equal(validateSprintBranch('fix/TASK-1234').valid, false);
    });
  });

  describe('getQualityGateCmd', () => {
    it('should return commands for known project', () => {
      const cmds = getQualityGateCmd('default');
      assert.ok(cmds.sast);
    });
    it('should return nulls for unknown', () => {
      assert.equal(getQualityGateCmd('unknown').lint, null);
    });
  });

  describe('getQualityGateDecision', () => {
    it('should return gates with blocking list', () => {
      const d = getQualityGateDecision();
      assert.ok(d.gates);
      assert.ok(Array.isArray(d.blocking));
      assert.ok(d.blocking.length > 0, 'deve ter ao menos 1 gate bloqueante');
      assert.ok('sast' in d.gates || 'security' in d.gates || 'lint' in d.gates, 'deve conter gates conhecidos');
    });
  });
});
