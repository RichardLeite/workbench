/**
 * Helpers de Asserção — playwright-cli E2E
 * ==========================================
 * Asserções no DOM via pageEval síncrono.
 *
 * Uso: const { assertTextVisible, assertModalContains } = require('./helpers/assertions');
 */

const { spawnSync } = require('child_process');
const { runPw } = require('./_base');

/**
 * Avalia expressão JS no navegador e retorna resultado como string.
 * @param {string} jsCode - código JS para executar no browser
 * @param {boolean} raw - se true, retorna stdout cru ao invés de processar
 * @returns {string}
 */
function pageEval(jsCode, raw = false) {
  const args = ['eval', `() => ${jsCode}`];
  if (raw) args.push('--raw');

  const result = spawnSync('playwright-cli', args, {
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
    env: process.env,
    encoding: 'utf8',
  });

  if (result.error) throw result.error;
  return (result.stdout || '').trim();
}

/**
 * Dispara um snapshot (acessibility tree) para debug.
 */
function snapshot() {
  runPw(['snapshot']);
}

/**
 * Verifica se um texto está visível no body da página.
 */
function assertTextVisible(text) {
  const escaped = text.replace(/'/g, "\\'");
  const result = pageEval(`document.body.textContent.includes('${escaped}')`, true);
  if (result !== 'true') {
    throw new Error(`❌ Texto nao encontrado na pagina: "${text}"`);
  }
  console.log(`   ✓ Texto visivel: "${text}"`);
}

/**
 * Verifica se um texto NÃO está visível na página.
 */
function assertTextNotVisible(text) {
  const escaped = text.replace(/'/g, "\\'");
  const result = pageEval(`!document.body.textContent.includes('${escaped}')`, true);
  if (result !== 'true') {
    throw new Error(`❌ Texto encontrado, mas nao deveria: "${text}"`);
  }
  console.log(`   ✓ Texto ausente: "${text}"`);
}

/**
 * Verifica se o modal ativo contém determinado texto.
 */
function assertModalContains(text) {
  const escaped = text.replace(/'/g, "\\'");
  const result = pageEval(`(function() {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    const active = dialogs.find(d =>
      d.offsetParent !== null || getComputedStyle(d).display !== 'none'
    );
    if (!active) return false;
    return (active.textContent || '').includes('${escaped}');
  })()`, true);

  if (result !== 'true') {
    throw new Error(`❌ Modal nao contem o texto: "${text}"`);
  }
  console.log(`   ✓ Modal contem: "${text}"`);
}

/**
 * Verifica se o modal ativo contém texto (retorna boolean, não lança erro).
 * Útil para condicionais: if (modalContainsText('...')) { ... }
 */
function modalContainsText(text) {
  const escaped = text.replace(/'/g, "\\'");
  const result = pageEval(`(function() {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    const active = dialogs.find(d =>
      d.offsetParent !== null || getComputedStyle(d).display !== 'none'
    );
    if (!active) return false;
    return (active.textContent || '').includes('${escaped}');
  })()`, true);
  return result === 'true';
}

/**
 * Verifica se a URL atual contém determinado path.
 */
function assertUrlContains(path) {
  const escaped = path.replace(/'/g, "\\'");
  const result = pageEval(`window.location.href.includes('${escaped}')`, true);
  if (result !== 'true') {
    throw new Error(`❌ URL nao contem: "${path}" (atual: ${pageEval('window.location.href', true)})`);
  }
  console.log(`   ✓ URL contem: "${path}"`);
}

/**
 * Espera condição com polling.
 * @param {function} conditionFn - função que retorna true quando satisfeita
 * @param {number} timeout - ms máximo
 * @param {number} interval - ms entre polls
 */
function waitFor(conditionFn, timeout = 10000, interval = 300) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (conditionFn()) return;
    require('./_base').sleep(interval);
  }
  throw new Error(`❌ Timeout aguardando condicao (${timeout}ms)`);
}

module.exports = {
  pageEval, snapshot, assertTextVisible, assertTextNotVisible,
  modalContainsText, assertModalContains, assertUrlContains, waitFor,
};
