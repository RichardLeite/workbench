/**
 * Helpers de Navegação — playwright-cli E2E
 * ===========================================
 * Padrões de navegação entre telas.
 *
 * Uso: const { navigate, clickSidebarItem } = require('./helpers/navigation');
 */

const { runPw, clickByText } = require('./_base');

/**
 * Navega para URL relativa ou absoluta.
 */
function navigate(url) {
  runPw(['goto', url]);
}

/**
 * Clique em item do sidebar pelo texto visível.
 * Preferir este método ao invés de navegação por URL,
 * pois simula o fluxo real do usuário.
 */
function clickSidebarItem(text) {
  clickByText(text);
  runPw(['snapshot']);
}

/**
 * Alterna para aba pelo índice (0-based).
 */
function switchTab(index) {
  runPw(['tab-select', String(index)]);
}

/**
 * Lista abas abertas.
 */
function listTabs() {
  runPw(['tab-list']);
}

/**
 * Fecha aba pelo índice.
 */
function closeTab(index) {
  runPw(['tab-close', String(index)]);
}

/**
 * Abre nova aba com URL opcional.
 */
function openNewTab(url) {
  const args = ['tab-new'];
  if (url) args.push(url);
  runPw(args);
}

/**
 * Voltar página anterior.
 */
function goBack() {
  runPw(['go-back']);
}

/**
 * Recarregar página atual.
 */
function reload() {
  runPw(['reload']);
}

/**
 * Atualizar viewport.
 */
function resize(width, height) {
  runPw(['resize', String(width), String(height)]);
}

module.exports = {
  navigate, clickSidebarItem, switchTab, listTabs,
  closeTab, openNewTab, goBack, reload, resize,
};
