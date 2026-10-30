const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const path = require('node:path');

const CLI = path.resolve(__dirname, '..', 'ado.js');
const {
  resolveProject,
  parseAbReference,
  getFallbackProjects,
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

// ─── Módulo: resolve ──────────────────────────────────────────────────────────

describe('resolve', () => {

  describe('API', () => {
    it('should return default project with no opts', () => {
      const result = resolveProject({});
      assert.ok(result.project);
      assert.equal(result.type, 'sprint');
    });

    it('should resolve Sprint Team as sprint', () => {
      const result = resolveProject({ project: 'Sprint Team' });
      assert.equal(result.type, 'sprint');
    });

    it('should resolve Hotfix Team as hotfix', () => {
      const result = resolveProject({ project: 'Hotfix Team' });
      assert.equal(result.type, 'hotfix');
    });

    it('should throw for unknown project', () => {
      assert.throws(() => resolveProject({ project: 'Unknown Squad' }));
    });
  });

  describe('CLI --list', () => {
    it('should list all projects', () => {
      const result = run('resolve', '--list');
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.ok(Array.isArray(parsed));
      assert.ok(parsed.length >= 2);
      assert.ok(parsed.some(p => p.project.includes('Sprint Team')));
      assert.ok(parsed.some(p => p.project.includes('Hotfix Team')));
    });
  });

  describe('CLI --validate', () => {
    it('should pass with valid config', () => {
      const result = run('resolve', '--validate');
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.valid, true);
      assert.ok(typeof parsed.projects === 'number');
    });
  });

  describe('CLI --project', () => {
    it('should resolve default project with no flags', () => {
      const result = run('resolve');
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.ok(parsed.project);
      assert.ok(parsed.project.includes('Sprint Team'), `deve ser Sprint Team: ${parsed.project}`);
    });

    it('should resolve by name', () => {
      const result = run('resolve', '--project', 'Hotfix Team');
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.type, 'hotfix');
    });

    it('should exit 1 for unknown project', () => {
      const result = run('resolve', '--project', 'Unknown Squad');
      assert.equal(result.exitCode, 1);
    });
  });

  describe('CLI --type', () => {
    it('should resolve sprint type', () => {
      const result = run('resolve', '--type', 'sprint');
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.ok(parsed.project.includes('Sprint Team'));
    });

    it('should resolve hotfix type', () => {
      const result = run('resolve', '--type', 'hotfix');
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.ok(parsed.project.includes('Hotfix Team'));
    });

    it('should exit 1 for unknown type', () => {
      const result = run('resolve', '--type', 'invalid');
      assert.equal(result.exitCode, 1);
    });
  });

  describe('CLI --url', () => {
    it('should extract project from Azure DevOps URL', () => {
      const url = 'https://dev.azure.com/your-org/Sprint%20Team/_workitems/edit/12345';
      const result = run('resolve', '--url', url);
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.ok(parsed.project.includes('Sprint Team'));
    });

    it('should exit 1 for malformed URL', () => {
      const result = run('resolve', '--url', 'not-a-url');
      assert.equal(result.exitCode, 1);
    });
  });
});

// ─── Módulo: parse ────────────────────────────────────────────────────────────

describe('parse', () => {

  describe('API', () => {
    it('should parse AB# reference', () => {
      const result = parseAbReference('AB#21284');
      assert.equal(result.id, 21284);
      assert.equal(result.format, 'AB_HASH');
    });

    it('should parse # reference', () => {
      const result = parseAbReference('#21284');
      assert.equal(result.id, 21284);
      assert.equal(result.format, 'HASH_ONLY');
    });

    it('should parse numeric reference', () => {
      const result = parseAbReference('21284');
      assert.equal(result.id, 21284);
      assert.equal(result.format, 'NUMERIC');
    });

    it('should parse full URL', () => {
      const url = 'https://dev.azure.com/your-org/Hotfix%20Team/_workitems/edit/21284';
      const result = parseAbReference(url);
      assert.equal(result.id, 21284);
      assert.equal(result.project, 'Hotfix Team');
      assert.equal(result.format, 'FULL_URL');
    });

    it('should parse AB# mixed in text', () => {
      const result = parseAbReference('Corrigir bug AB#21284 no módulo fiscal');
      assert.equal(result.id, 21284);
      assert.equal(result.format, 'AB_HASH');
    });

    it('should return error for invalid input', () => {
      const result = parseAbReference('abc');
      assert.equal(result.id, null);
      assert.equal(result.format, 'INVALID');
      assert.ok(result.error);
    });

    it('should return error for empty input', () => {
      const result = parseAbReference('');
      assert.equal(result.id, null);
      assert.equal(result.format, 'INVALID');
    });
  });

  describe('CLI', () => {
    it('should parse AB# via CLI', () => {
      const result = run('parse', 'AB#21284');
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.id, 21284);
    });

    it('should exit 1 for empty input', () => {
      const result = run('parse', '');
      assert.equal(result.exitCode, 1);
    });
  });
});

// ─── Módulo: fallback ─────────────────────────────────────────────────────────

describe('fallback', () => {

  describe('API', () => {
    it('should return defaultProject and projects array', () => {
      const result = getFallbackProjects();
      assert.ok(result.defaultProject);
      assert.equal(result.defaultProject, 'Sprint Team');
      assert.ok(Array.isArray(result.projects));
      assert.ok(result.projects.length >= 2);
    });

    it('should have defaultProject as first in list', () => {
      const result = getFallbackProjects();
      assert.equal(result.projects[0].project, result.defaultProject);
    });
  });

  describe('CLI', () => {
    it('should list projects with default first', () => {
      const result = run('fallback');
      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.ok(parsed.defaultProject);
      assert.ok(Array.isArray(parsed.projects));
    });
  });
});
