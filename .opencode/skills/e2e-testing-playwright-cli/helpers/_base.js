/**
 * Base Helpers — playwright-cli E2E
 * ===================================
 * Funções fundamentais compartilhadas entre todos os helpers.
 *
 * Uso: const { runPw, sleep, clickByText } = require('./helpers/_base');
 */

const { spawnSync } = require('child_process');
const { resolve } = require('path');

// ─── Node version guard ───────────────────────────────────────────────────────
const NODE_MAJOR = parseInt(process.versions.node.split('.')[0], 10);
if (NODE_MAJOR < 18) {
  console.error('');
  console.error('❌ playwright-cli requer Node.js >= 18');
  console.error(`   Versao atual: ${process.versions.node}`);
  console.error('');
  console.error('   Para trocar de versao, use nvm:');
  console.error('   $ nvm use 20');
  console.error('');
  console.error('   Para ver versoes disponiveis:');
  console.error('   $ nvm ls');
  console.error('');
  process.exit(1);
}

// ─── Resolve playwright-cli binary (usa o mesmo Node que executa o script) ────
const PW_CLI = (() => {
  const nodeMajor = process.versions.node.split('.')[0];
  // Tenta achar no mesmo prefix do Node atual
  const nodeBinDir = resolve(process.execPath, '..');
  const candidate = resolve(nodeBinDir, 'playwright-cli');
  try { require('fs').accessSync(candidate); return candidate; } catch (_) {}
  // Fallback: PATH
  return 'playwright-cli';
})();

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy-wait cross-platform */ }
}

function runPw(args, { allowFailure = false, stdio = 'inherit' } = {}) {
  const result = spawnSync(PW_CLI, args, {
    stdio,
    shell: process.platform === 'win32',
    env: process.env,
  });

  if (result.error && !allowFailure) throw result.error;
  if (typeof result.status === 'number' && result.status !== 0 && !allowFailure) {
    process.exit(result.status);
  }
  return result;
}

function clickByText(text, { allowFailure = false } = {}) {
  const escaped = text.replace(/'/g, "\\'");
  runPw([
    'eval',
    `() => {
      const all = Array.from(document.querySelectorAll(
        'button, a, span, [role="button"], [role="tab"], label, li'
      ));
      const target = all.find(el =>
        (el.textContent || '').trim().includes('${escaped}')
      );
      if (!target) throw new Error('Elemento nao encontrado: ${escaped}');
      target.click();
      return true;
    }`,
  ], { allowFailure });
}

function fillByPlaceholder(placeholder, value) {
  const escaped = placeholder.replace(/'/g, "\\'");
  const val = value.replace(/'/g, "\\'");
  runPw([
    'eval',
    `() => {
      const input = document.querySelector('input[placeholder="${escaped}"]');
      if (!input) throw new Error('Input nao encontrado: ${escaped}');
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeInputValueSetter.call(input, '${val}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }`,
  ]);
}

/**
 * Preenche input usando seletor CSS (fallback quando não há placeholder).
 * Uso: fillBySelector('input[name="email"]', 'valor')
 *       fillBySelector('.password-div input', 'senha')
 */
function fillBySelector(selector, value) {
  const escaped = selector.replace(/'/g, "\\'");
  const val = value.replace(/'/g, "\\'");
  runPw([
    'eval',
    `() => {
      const input = document.querySelector('${escaped}');
      if (!input) throw new Error('Input nao encontrado: ${escaped}');
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeInputValueSetter.call(input, '${val}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }`,
  ]);
}

module.exports = { runPw, sleep, clickByText, fillByPlaceholder, fillBySelector };
