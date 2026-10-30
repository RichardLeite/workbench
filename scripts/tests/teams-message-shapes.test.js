const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const { validateShape } = require('../teams-message-shapes');
const { extractMentionNames } = require('../teams-mentions');

const title = '🔥 HOTFIX TASK-21398 — Report layout';
const message = [
  '<strong>🔥 HOTFIX TASK-21398 — Report layout</strong>',
  '📂 <strong>PRs:</strong>',
  '📱 APP → #5169 → main: <a href="https://github.com/example/app/pull/5169">PR #5169</a>',
  '✍️ Autor: Outra Pessoa',
  '👤 Revisor: <at id="0">Pessoa Exemplo</at>',
].join('<br><br>');
const mentions = [{ name: 'Pessoa Exemplo', email: 'pessoa@example.com' }];

test('validates Graph HTML with indexed mention and clickable link', () => {
  const result = validateShape('pr-notification', title, message, mentions);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('extracts indexed and legacy mention tags', () => {
  assert.deepEqual(
    extractMentionNames('<at id="0">Pessoa Exemplo</at> e <at>Outra Pessoa</at>'),
    ['Pessoa Exemplo', 'Outra Pessoa'],
  );
});

test('CLI parses flags after shape name', () => {
  const script = path.resolve(__dirname, '..', 'teams-message-shapes.js');
  const result = spawnSync(
    process.execPath,
    [
      script,
      'validate',
      'pr-notification',
      '--title',
      title,
      '--message',
      message,
      '--mentions',
      JSON.stringify(mentions),
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).valid, true);
});
