#!/usr/bin/env node
/**
 * E2E Test Script — playwright-cli
 * =================================
 * Template gerado pela skill e2e-testing-playwright-cli.
 *
 * Uso:
 *   1. Configurar credenciais (escolha UM metodo):
 *      a) cp src/__tests__/e2e/config/.env.example src/__tests__/e2e/config/.env
 *         # editar .env com dados reais
 *      b) export E2E_CLIENT_EMAIL=... E2E_CLIENT_PASSWORD=...
 *
 *   2. nvm use 20
 *
 *   3. node run-test.js
 *
 * Para vídeo:
 *   export E2E_VIDEO_FILE=evidencia.mp4
 *   node run-test.js
 *
 * ─── IMPORTAR ──────────────────────────────────────────────────────────────
 *   // Helpers base (workbench)
 *   const { runPw, sleep, clickByText, fillByPlaceholder, fillBySelector } =
 *     require('../../../../../.opencode/skills/e2e-testing-playwright-cli/helpers/_base');
 *
 *   // Helpers específicos do app
 *   const { loginOSDigital } = require('../helpers/login');
 *   const { client } = require('../config/users');
 *
 *   // Uso:
 *   loginOSDigital(client.email, client.password);
 */

const { spawnSync } = require('child_process');

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

// ─── Configurações ────────────────────────────────────────────────────────────
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const TEST_NAME = 'nome-do-teste';
const EVIDENCE_DIR = process.env.E2E_EVIDENCE_DIR
  || `src/__tests__/e2e/evidence/${TEST_NAME}`;
const VIDEO_FILE = process.env.E2E_VIDEO_FILE
  || `${EVIDENCE_DIR}/evidencia.mp4`;
const REQUIRED_ENV = [];

// Garantir que diretório de evidências existe
const { mkdirSync } = require('fs');
try { mkdirSync(EVIDENCE_DIR, { recursive: true }); } catch (_) {}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy-wait cross-platform */ }
}

function requireEnv(vars) {
  const missing = (vars || REQUIRED_ENV).filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`❌ Variaveis obrigatorias ausentes: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function runPw(args, { allowFailure = false, stdio = 'inherit' } = {}) {
  const result = spawnSync('playwright-cli', args, {
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

// ─── Helpers de interação ─────────────────────────────────────────────────────

/**
 * Clique em elemento pelo texto visível (botão, link, span, etc).
 * Fallback robusto quando não temos ref do playwright-cli.
 */
function clickByText(text, { allowFailure = false } = {}) {
  const escaped = text.replace(/'/g, "\\'");
  runPw([
    'eval',
    `() => {
      const all = Array.from(document.querySelectorAll('button, a, span, [role="button"], [role="tab"], label, li'));
      const target = all.find(el =>
        (el.textContent || '').trim().includes('${escaped}')
      );
      if (!target) throw new Error('Elemento nao encontrado: ${escaped}');
      target.click();
      return true;
    }`,
  ], { allowFailure });
}

/**
 * Preenche input pelo placeholder (mais estável que ref e10/e14).
 */
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
 * Espera até que um texto apareça no DOM (com timeout).
 */
function waitForText(text, timeout = 10000) {
  const escaped = text.replace(/'/g, "\\'");
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = spawnSync('playwright-cli', [
      'eval',
      `() => document.body.textContent.includes('${escaped}')`,
      '--raw',
    ], {
      stdio: ['ignore', 'pipe', 'inherit'],
      shell: process.platform === 'win32',
      env: process.env,
      encoding: 'utf8',
    });
    if ((result.stdout || '').trim() === 'true') return true;
    sleep(300);
  }
  throw new Error(`Timeout esperando texto: ${text}`);
}

/**
 * Verifica se o modal ativo contém determinado texto.
 */
function modalContainsText(text) {
  const escaped = text.replace(/'/g, "\\'");
  const result = spawnSync('playwright-cli', [
    'eval',
    `() => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      const active = dialogs.find(d =>
        d.offsetParent !== null || getComputedStyle(d).display !== 'none'
      );
      if (!active) return false;
      return (active.textContent || '').includes('${escaped}');
    }`,
    '--raw',
  ], {
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
    env: process.env,
    encoding: 'utf8',
  });
  return (result.stdout || '').trim() === 'true';
}

/**
 * Clique em botão dentro do modal ativo.
 */
function clickModalButtonByText(text) {
  const escaped = text.replace(/'/g, "\\'");
  runPw([
    'eval',
    `() => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      const active = dialogs.find(d =>
        d.offsetParent !== null || getComputedStyle(d).display !== 'none'
      );
      if (!active) throw new Error('Modal ativo nao encontrado');
      const btn = Array.from(active.querySelectorAll('button')).find(b =>
        (b.textContent || '').trim().includes('${escaped}')
      );
      if (!btn) throw new Error('Botao no modal nao encontrado: ${escaped}');
      btn.click();
      return true;
    }`,
  ]);
}

// ─── Helpers de navegação ─────────────────────────────────────────────────────

function navigate(url) {
  runPw(['goto', url]);
}

function resizeViewport(width, height) {
  runPw(['resize', String(width), String(height)]);
}

function snapshot() {
  runPw(['snapshot']);
}

function screenshot(name) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${EVIDENCE_DIR}/${name || 'screenshot'}-${ts}.png`;
  const args = ['screenshot', '--filename', filename];
  runPw(args);
  console.log(`   📸 Screenshot: ${filename}`);
}

function videoStart(filePath, size = '1920x1080') {
  if (filePath) runPw(['video-start', filePath, '--size', size]);
}

function videoChapter(name) {
  if (VIDEO_FILE) runPw(['video-chapter', name]);
}

function videoStop() {
  if (VIDEO_FILE) runPw(['video-stop']);
}

function closeBrowser() {
  runPw(['close-all'], { allowFailure: true });
}

function clearSession() {
  runPw(['cookie-clear'], { allowFailure: true });
  runPw(['localstorage-clear'], { allowFailure: true });
  runPw(['sessionstorage-clear'], { allowFailure: true });
}

// ─── Helpers de login SPA (Meu Projeto) ────────────────────────────────────────
// NOTA: Esses helpers estão no app em src/__tests__/e2e/helpers/login.js
// Esta é a definição de referência para o template.

function closeModals() {
  runPw(['eval', `() => {
    const sel = [
      '[role="dialog"]', '[role="alertdialog"]', '.modal.show', '.modal', '.modal.fade',
      '.modal-backdrop', '.MuiDialog-root', '.MuiModal-root',
      '.redux-toastr', '.toastr',
      '[class*="overlay"]', '[class*="backdrop"]',
    ];
    sel.forEach(s => document.querySelectorAll(s).forEach(el => {
      try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch(e) {}
    }));
    document.body.classList.remove('modal-open');
    document.body.style.overflow = 'auto';
    document.querySelectorAll('#modal-root, .ReactModalPortal, [class*="portal"]')
      .forEach(r => { try { r.innerHTML = ''; } catch(e) {} });
    // Clica em SVGs de X
    document.querySelectorAll('button, a, span, div, [role="button"]').forEach(el => {
      const svg = el.querySelector('svg');
      if (!svg) return;
      let isClose = false;
      svg.querySelectorAll('path').forEach(p => {
        const d = (p.getAttribute('d') || '').replace(/\\s/g, '');
        if (d.includes('M18') && d.includes('6') && d.includes('M6') && d.includes('18')) isClose = true;
        if (d.includes('m6') && d.includes('6') && d.includes('12') && d.includes('12')) isClose = true;
      });
      if (el.className && typeof el.className === 'string' && (el.className.includes('close') || el.className.includes('x-'))) isClose = true;
      if (isClose) try { el.click(); } catch(e) {}
    });
    document.querySelectorAll('button, [role="button"]').forEach(el => {
      const t = (el.textContent || '').trim();
      if (t === '×' || t === 'x' || t === 'X' || t === '✕') try { el.click(); } catch(e) {}
    });
    return true;
  }`], { allowFailure: true });
  sleep(1000);
}

function loginOSDigital(email, password, { afterLoginWait = 10000, closeModals: shouldClose = true } = {}) {
  fillByPlaceholder('seu@gmail.com', email);
  fillBySelector('.password-div input', password);
  runPw(['click', 'button.btn-sucesso'], { allowFailure: true });
  runPw(['snapshot']);
  console.log('   Aguardando carregamento da conta...');
  sleep(afterLoginWait);
  if (shouldClose) {
    console.log('   Fechando modais pos-login...');
    closeModals();
    sleep(3000);
    closeModals();
  }
  runPw(['snapshot']);
}

// ─── Main — fluxo do teste ────────────────────────────────────────────────────

function main() {
  requireEnv();

  console.log(`🧪 Iniciando teste E2E: ${process.env.E2E_TEST_NAME || 'Sem nome'}`);
  console.log(`   URL: ${BASE_URL}`);

  closeBrowser();
  runPw(['open', BASE_URL, '--browser=chrome', '--headed']);
  resizeViewport(1920, 1080);
  videoStart(VIDEO_FILE);

  // ═══════════════════════════════════════════════════════════════════════════
  //  SEU CENÁRIO AQUI
  //  Regras:
  //  - Após cada goto, aguardar carregamento: sleep(5000)
  //  - Screenshots nomeados por etapa (01-, 02-, etc)
  //
  //  Exemplo:
  //
  //  videoChapter('1) Login');
  //  goto('http://localhost:3000/client-login');
  //  sleep(5000);                    // ← aguarda carregamento
  //  screenshot('01-login-page');    // ← print com página carregada
  //  loginOSDigital('email@teste.com', 'senha123');
  //  waitForText('Dashboard');
  //
  //  videoChapter('2) Fluxo principal');
  //  clickByText('Nova Venda');
  //  screenshot('02-nova-venda');
  // ═══════════════════════════════════════════════════════════════════════════

  videoStop();
  closeBrowser();

  console.log('✅ Teste finalizado com sucesso.');
  if (VIDEO_FILE) console.log(`   Video: ${VIDEO_FILE}`);
}

main();
