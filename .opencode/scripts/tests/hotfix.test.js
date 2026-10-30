const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const path = require('node:path');

const CLI = path.resolve(__dirname, '..', 'hotfix.js');
const {
  loadConfig,
  validateHotfixBranch,
  validateReleaseBranch,
  validateCherryPickFlow,
  validatePrCount,
  getQualityGateCommands,
  getGateDecision,
  getPrConfig,
  cli,
} = require(CLI);

function run(...args) {
  try {
    const quoted = args.map(a => a.includes(' ') ? `"${a}"` : a);
    const output = execSync(`node "${CLI}" ${quoted.join(' ')}`, { encoding: 'utf-8' });
    return { exitCode: 0, stdout: output.trim() };
  } catch (e) {
    return { exitCode: e.status ?? 1, stdout: e.stdout?.trim() ?? '' };
  }
}

describe('hotfix.js', () => {

  describe('loadConfig', () => {
    it('should load config with prCount=2', () => {
      const config = loadConfig();
      assert.ok(config);
      assert.equal(config.prCount, 2);
      assert.equal(config.branchPattern, 'fix/TASK-XXXX');
      assert.equal(config.branchPatternRelease, 'fix/TASK-XXXX-release');
    });
  });

  describe('validateHotfixBranch', () => {
    it('should accept valid hotfix branch', () => {
      const result = validateHotfixBranch('fix/TASK-21284');
      assert.equal(result.valid, true);
    });

    it('should reject feat/ prefixed branch', () => {
      const result = validateHotfixBranch('feat/TASK-21284');
      assert.equal(result.valid, false);
    });

    it('should reject branch without TASK-', () => {
      const result = validateHotfixBranch('fix/my-branch');
      assert.equal(result.valid, false);
    });
  });

  describe('validateReleaseBranch', () => {
    it('should accept valid release branch', () => {
      const result = validateReleaseBranch('fix/TASK-21284-release');
      assert.equal(result.valid, true);
    });

    it('should reject branch without -release suffix', () => {
      const result = validateReleaseBranch('fix/TASK-21284');
      assert.equal(result.valid, false);
    });
  });

  describe('validateCherryPickFlow', () => {
    it('should pass when commits match', () => {
      const result = validateCherryPickFlow(['abc123', 'def456'], ['abc123', 'def456']);
      assert.equal(result.valid, true);
      assert.equal(result.matchCount, 2);
    });

    it('should fail when commits do not match', () => {
      const result = validateCherryPickFlow(['abc123'], ['xyz789']);
      assert.equal(result.valid, false);
      assert.equal(result.matchCount, 0);
    });

    it('should handle partial match', () => {
      const result = validateCherryPickFlow(['abc123', 'def456'], ['abc123']);
      assert.equal(result.valid, false);
      assert.equal(result.matchCount, 1);
    });
  });

  describe('validatePrCount', () => {
    it('should accept 2 PRs for hotfix', () => {
      const result = validatePrCount(2);
      assert.equal(result.valid, true);
    });

    it('should reject 1 PR for hotfix', () => {
      const result = validatePrCount(1);
      assert.equal(result.valid, false);
    });
  });

  describe('CLI', () => {
    it('config should output JSON with prCount=2', () => {
      const result = run('config');
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.prCount, 2);
    });

    it('validate-branch should accept valid branch', () => {
      const result = run('validate-branch', 'fix/TASK-12345');
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.valid, true);
    });

    it('validate-pr-count should accept 2', () => {
      const result = run('validate-pr-count', '2');
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.valid, true);
    });

    it('quality-gates should output commands for known project', () => {
      const result = run('quality-gates', 'default');
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.ok(parsed.commands.security);
    });

    it('gate should output decision tree', () => {
      const result = run('gate');
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.ok(parsed.gates);
      assert.equal(parsed.securityBlocking, true);
    });

    it('pr-config should output targets', () => {
      const result = run('pr-config');
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.prCount, 2);
    });
  });
});
