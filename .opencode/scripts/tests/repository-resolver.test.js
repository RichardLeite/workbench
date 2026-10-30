'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const resolver = require('../repository-resolver.js');
const scriptPath = path.resolve(__dirname, '..', 'repository-resolver.js');

function fixture(t, projects) {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repository-resolver-'));
  const mappingPath = path.join(rootPath, 'project-mapping.json');
  fs.writeFileSync(mappingPath, JSON.stringify({ projects }));
  t.after(() => fs.rmSync(rootPath, { recursive: true, force: true }));
  return { rootPath, mappingPath };
}

function mkdir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

test('loadProjectMapping loads a provided mapping', t => {
  const context = fixture(t, { sample: { repos: {} } });
  assert.ok(resolver.loadProjectMapping(context.mappingPath).projects.sample);
});

test('resolves available repository with .git directory', t => {
  const context = fixture(t, { sample: { repos: { api: 'sample-api' } } });
  mkdir(path.join(context.rootPath, 'sample-api', '.git'));
  assert.equal(resolver.resolveRepository('sample', 'api', context).status, 'available');
});

test('resolves available worktree with .git file', t => {
  const context = fixture(t, { sample: { repos: { api: 'sample-api' } } });
  mkdir(path.join(context.rootPath, 'sample-api'));
  fs.writeFileSync(path.join(context.rootPath, 'sample-api', '.git'), 'gitdir: elsewhere');
  assert.equal(resolver.resolveRepository('sample', 'api', context).status, 'available');
});

test('resolves missing and invalid_git repositories', t => {
  const context = fixture(t, { sample: { repos: { missing: 'missing', invalid: 'invalid' } } });
  mkdir(path.join(context.rootPath, 'invalid'));
  assert.equal(resolver.resolveRepository('sample', 'missing', context).status, 'missing');
  assert.equal(resolver.resolveRepository('sample', 'invalid', context).status, 'invalid_git');
});

test('aggregates multi-repository states', t => {
  const projects = {
    partial: { repos: { api: 'partial-api', app: 'partial-app' } },
    complete: { repos: { api: 'complete-api', app: 'complete-app' } },
    absent: { repos: { api: 'absent-api' } },
    invalid: { repos: { api: 'invalid-api' } },
  };
  const context = fixture(t, projects);
  for (const repo of ['partial-api', 'complete-api', 'complete-app']) mkdir(path.join(context.rootPath, repo, '.git'));
  mkdir(path.join(context.rootPath, 'invalid-api'));
  assert.equal(resolver.resolveProjectRepositories('partial', context).status, 'partial');
  assert.equal(resolver.resolveProjectRepositories('complete', context).status, 'complete');
  assert.equal(resolver.resolveProjectRepositories('absent', context).status, 'absent');
  assert.equal(resolver.resolveProjectRepositories('invalid', context).status, 'invalid');
  assert.equal(resolver.resolveAllProjects(context).length, 4);
});

test('nested path inherits .git only from its catalog checkout root', t => {
  const context = fixture(t, { sample: { repos: { web: 'sample-api/packages/web' } } });
  mkdir(path.join(context.rootPath, 'sample-api', '.git'));
  mkdir(path.join(context.rootPath, 'sample-api', 'packages', 'web'));
  const result = resolver.resolveRepository('sample', 'web', context);
  assert.equal(result.status, 'available');
  assert.equal(result.gitRoot, path.join(context.rootPath, 'sample-api'));
});

test('nested path does not inherit workbench .git', t => {
  const context = fixture(t, { sample: { repos: { web: 'sample-api/packages/web' } } });
  mkdir(path.join(context.rootPath, '.git'));
  mkdir(path.join(context.rootPath, 'sample-api', 'packages', 'web'));
  assert.equal(resolver.resolveRepository('sample', 'web', context).status, 'invalid_git');
});

test('rejects catalog path escaping root with parent traversal', t => {
  const context = fixture(t, { sample: { repos: { api: '../outside' } } });
  assert.throws(
    () => resolver.resolveRepository('sample', 'api', context),
    /Unsafe repository path escapes workbench root/,
  );
});

test('rejects absolute catalog path', t => {
  const context = fixture(t, { sample: { repos: { api: path.resolve(os.tmpdir(), 'outside-repository') } } });
  assert.throws(
    () => resolver.resolveRepository('sample', 'api', context),
    /catalog path must be relative/,
  );
});

test('rejects catalog path escaping root through symlink', t => {
  const outsidePath = fs.mkdtempSync(path.join(os.tmpdir(), 'repository-resolver-outside-'));
  const context = fixture(t, { sample: { repos: { api: 'linked/repository' } } });
  mkdir(path.join(outsidePath, 'repository', '.git'));
  t.after(() => fs.rmSync(outsidePath, { recursive: true, force: true }));

  try {
    fs.symlinkSync(outsidePath, path.join(context.rootPath, 'linked'), 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`Symlink creation denied by environment (${error.code})`);
      return;
    }
    throw error;
  }

  assert.throws(
    () => resolver.resolveRepository('sample', 'api', context),
    /escapes workbench root through symlink/,
  );
});

test('workbench without catalog repos resolves its root', t => {
  const context = fixture(t, { workbench: { repos: {} } });
  mkdir(path.join(context.rootPath, '.git'));
  const result = resolver.resolveProjectRepositories('workbench', context);
  assert.equal(result.status, 'complete');
  assert.equal(result.repositories[0].role, 'root');
});

test('CLI emits JSON and rejects unknown project or role', t => {
  const context = fixture(t, { sample: { repos: { api: 'sample-api' } } });
  mkdir(path.join(context.rootPath, 'sample-api', '.git'));
  const args = ['--mapping', context.mappingPath, '--root', context.rootPath];
  const success = spawnSync(process.execPath, [scriptPath, '--project', 'sample', '--repo', 'api', ...args], { encoding: 'utf-8' });
  assert.equal(success.status, 0);
  assert.equal(JSON.parse(success.stdout).status, 'available');

  const unknownProject = spawnSync(process.execPath, [scriptPath, '--project', 'unknown', ...args], { encoding: 'utf-8' });
  assert.equal(unknownProject.status, 1);
  assert.match(unknownProject.stderr, /Unknown project/);

  const unknownRole = spawnSync(process.execPath, [scriptPath, '--project', 'sample', '--repo', 'unknown', ...args], { encoding: 'utf-8' });
  assert.equal(unknownRole.status, 1);
  assert.match(unknownRole.stderr, /Unknown repository role/);
});

test('CLI rejects unknown flag, missing value and invalid mapping JSON', t => {
  const context = fixture(t, { sample: { repos: {} } });

  const unknownFlag = spawnSync(process.execPath, [scriptPath, '--unknown'], { encoding: 'utf-8' });
  assert.equal(unknownFlag.status, 1);
  assert.match(unknownFlag.stderr, /Unknown argument: --unknown/);

  const missingValue = spawnSync(process.execPath, [scriptPath, '--project'], { encoding: 'utf-8' });
  assert.equal(missingValue.status, 1);
  assert.match(missingValue.stderr, /Missing value for --project/);

  fs.writeFileSync(context.mappingPath, '{invalid json');
  const invalidMapping = spawnSync(process.execPath, [scriptPath, '--mapping', context.mappingPath], { encoding: 'utf-8' });
  assert.equal(invalidMapping.status, 1);
  assert.match(invalidMapping.stderr, /Invalid project mapping JSON/);
});
