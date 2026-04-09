// ============================================================
// MAIN.JS — Ponto de entrada do aplicativo
// Gerencia autenticação, navegação entre páginas, carregamento
// dinâmico de HTML e inicialização dos módulos de cada tela.
// Também roda o tick global (1x por segundo) pra atualizar timers.
// ============================================================

import { initOverview, updateOverview } from './overview.js';
import { initMedicao, updateMedicao, cleanupMedicao } from './medicao.js';
import { initConfig } from './config.js';
import { initLogin } from './login.js';
import { store } from './store.js';
import { api } from './api.js';
import { vibrate } from './utils.js';

const container = document.getElementById('page-container');
const navButtons = document.querySelectorAll('.nav-btn');
const navbar = document.getElementById('navbar');
const btnThemeToggle = document.getElementById('btn-theme-toggle');
let currentPage = null;

// Usuário autenticado — carregado do sessionStorage
let usuarioAtual = null;

// ============================================================
// AUTENTICAÇÃO
// ============================================================

// Verifica se há sessão ativa no sessionStorage.
// Se houver token, valida com o backend. Se não houver, mostra login.
async function iniciarApp() {
  const token = sessionStorage.getItem('smartline_token');
  const usuarioSalvo = sessionStorage.getItem('smartline_usuario');

  if (token && usuarioSalvo) {
    try {
      // Valida o token com o backend
      const usuario = await api.me();
      usuarioAtual = usuario;
      entrarNoApp(usuario);
    } catch {
      // Token inválido (servidor reiniciou) — vai para login
      sessionStorage.removeItem('smartline_token');
      sessionStorage.removeItem('smartline_usuario');
      mostrarLogin();
    }
  } else {
    mostrarLogin();
  }
}

// Exibe a tela de login e esconde a navbar e botão de tema.
function mostrarLogin() {
  navbar?.classList.add('hidden');
  if (btnThemeToggle) btnThemeToggle.style.display = 'none';
  loadPageLogin();
}

// Carrega e inicializa a tela de login.
async function loadPageLogin() {
  currentPage = 'login';
  navButtons.forEach(btn => btn.classList.remove('active'));
  try {
    const resp = await fetch('pages/login.html', { cache: 'no-store' });
    const html = await resp.text();
    container.innerHTML = html;
    initLogin((usuario) => {
      usuarioAtual = usuario;
      entrarNoApp(usuario);
    });
  } catch {
    container.innerHTML = '<div class="empty-state"><p>Erro ao carregar login</p></div>';
  }
}

// Entra no app após login bem sucedido.
// Exibe navbar, botão de tema e redireciona conforme o nível do usuário.
function entrarNoApp(usuario) {
  navbar?.classList.remove('hidden');
  if (btnThemeToggle) btnThemeToggle.style.display = '';

  // Filtra botões da navbar conforme o nível
  aplicarPermissoesNavbar(usuario.nivel);

  // Redireciona para a tela inicial conforme o nível
  const paginaInicial = {
    admin: 'overview',
    auditor: 'overview',
    cliente: 'overview',
  }[usuario.nivel] || 'overview';

  loadPage(paginaInicial);
}

// Mostra/oculta botões da navbar conforme o nível do usuário.
// Admin: todas as telas | Auditor: Medição + Overview | Cliente: só Overview
function aplicarPermissoesNavbar(nivel) {
  navButtons.forEach(btn => {
    const page = btn.dataset.page;
    if (nivel === 'cliente') {
      btn.style.display = page === 'overview' ? '' : 'none';
    } else if (nivel === 'auditor') {
      btn.style.display = page === 'config' ? 'none' : '';
    } else {
      btn.style.display = ''; // admin vê tudo
    }
  });
}

// Realiza o logout — limpa sessão e volta para login.
function logout() {
  sessionStorage.removeItem('smartline_token');
  sessionStorage.removeItem('smartline_usuario');
  usuarioAtual = null;
  store.resetMeasurement();
  document.getElementById('modal-usuarios')?.remove();
  document.getElementById('modal-config-maquina')?.remove();
  mostrarLogin();
}

// Ouve o evento de logout disparado pela api.js (token inválido).
window.addEventListener('auth:logout', logout);

// Expõe logout globalmente para uso em outras telas.
window.smartlineLogout = logout;

// Expõe usuário atual globalmente.
Object.defineProperty(window, 'usuarioAtual', {
  get: () => usuarioAtual,
});

// ============================================================
// NAVEGAÇÃO
// ============================================================

// Carrega uma página dinamicamente via fetch do HTML
// e inicializa o módulo JS correspondente.
async function loadPage(name) {
  if (currentPage === name) return;
  if (currentPage === 'medicao') cleanupMedicao();

  currentPage = name;
  navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.page === name));

  try {
    const resp = await fetch(`pages/${name}.html`, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    if (currentPage !== name) return;
    container.innerHTML = html;

    switch (name) {
      case 'overview': initOverview(); break;
      case 'medicao':  initMedicao();  break;
      case 'config':   initConfig();   break;
    }
  } catch (e) {
    if (currentPage !== name) return;
    console.error('Erro ao carregar página:', e);
    container.innerHTML = `<div class="empty-state"><p>Erro ao carregar página</p></div>`;
  }
}

// Configura os botões da navbar para navegar entre páginas.
navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    // Verifica permissão antes de navegar
    const page = btn.dataset.page;
    const nivel = usuarioAtual?.nivel;
    if (nivel === 'cliente' && page !== 'overview') return;
    if (nivel === 'auditor' && page === 'config') return;
    loadPage(page);
  });
});

// ============================================================
// MODAIS GLOBAIS — produção periódica e fim de turno
// ============================================================

let shiftEndCountdownInterval = null;
let shiftEndAutoFinalizeTimeout = null;
const SHIFT_END_AUTO_FINALIZE_MS = 5 * 60 * 1000;

// Limpa o countdown do fim de turno e cancela o timeout de auto-finalização.
function clearShiftEndCountdown() {
  if (shiftEndCountdownInterval) { clearInterval(shiftEndCountdownInterval); shiftEndCountdownInterval = null; }
  if (shiftEndAutoFinalizeTimeout) { clearTimeout(shiftEndAutoFinalizeTimeout); shiftEndAutoFinalizeTimeout = null; }
  const el = document.getElementById('shift-end-countdown');
  if (el) el.textContent = '';
}

// Inicia o countdown regressivo de 5 minutos com auto-finalização.
function startShiftEndCountdown() {
  clearShiftEndCountdown();
  const countdownEl = document.getElementById('shift-end-countdown');
  const deadline = Date.now() + SHIFT_END_AUTO_FINALIZE_MS;

  function tick() {
    const remaining = Math.max(0, deadline - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    if (countdownEl) countdownEl.textContent = `Auto-finalizando em ${mins}:${String(secs).padStart(2, '0')}`;
  }

  tick();
  shiftEndCountdownInterval = setInterval(tick, 1000);
  shiftEndAutoFinalizeTimeout = setTimeout(() => {
    clearShiftEndCountdown();
    document.getElementById('modal-shift-end')?.classList.add('hidden');
    store.finalizeMeasurement();
    vibrate([200]);
    loadPage('medicao');
  }, SHIFT_END_AUTO_FINALIZE_MS);
}

window._clearShiftEndCountdown = clearShiftEndCountdown;

// Inicializa os listeners dos modais globais de produção e fim de turno.
function initGlobalModals() {
  document.getElementById('btn-confirm-production')?.addEventListener('click', () => {
    const input = document.getElementById('production-input');
    const value = parseInt(input.value);
    if (isNaN(value) || value < 0) { input.style.borderColor = 'var(--red)'; return; }
    const lastReading = store.getLastReading();
    if (lastReading && value < lastReading.value) {
      if (!confirm(`Valor (${value}) menor que última leitura (${lastReading.value}). Confirma?`)) return;
    }
    store.addProductionReading(value);
    input.value = ''; input.style.borderColor = '';
    document.getElementById('modal-production')?.classList.add('hidden');
    vibrate([50]);
  });

  document.getElementById('btn-end-shift')?.addEventListener('click', () => {
    clearShiftEndCountdown();
    store.markShiftEndPrompted();
    document.getElementById('modal-shift-end')?.classList.add('hidden');
    store.finalizeMeasurement();
    vibrate([200]);
    loadPage('medicao');
  });

  document.getElementById('btn-extend-shift')?.addEventListener('click', () => {
    clearShiftEndCountdown();
    const input = document.getElementById('new-shift-end-input');
    if (input?.value) {
      store.updateConfig({ shiftEnd: input.value });
      store.resetShiftEndPrompted();
    }
    document.getElementById('modal-shift-end')?.classList.add('hidden');
  });
}

// ============================================================
// TOGGLE DE TEMA GLOBAL
// ============================================================

// Atualiza o ícone do botão de tema conforme o tema atual.
function atualizarIconeTema() {
  const isDark = store.getTheme() === 'dark';
  const iconSun = document.getElementById('icon-sun');
  const iconMoon = document.getElementById('icon-moon');
  if (iconSun) iconSun.style.display = isDark ? 'block' : 'none';
  if (iconMoon) iconMoon.style.display = isDark ? 'none' : 'block';
}

// Inicializa o botão de tema global.
function initThemeToggle() {
  const btn = document.getElementById('btn-theme-toggle');
  if (!btn) return;
  atualizarIconeTema();
  btn.addEventListener('click', () => {
    const newTheme = store.getTheme() === 'dark' ? 'light' : 'dark';
    store.setTheme(newTheme);
    atualizarIconeTema();
  });
}

// ============================================================
// TICK GLOBAL
// ============================================================

// Roda a cada 1 segundo para atualizar timers e verificar condições periódicas.
setInterval(() => {
  if (currentPage === 'overview') updateOverview();
  if (currentPage === 'medicao')  updateMedicao();

  if (store.measurement.active) {
    if (store.shouldPromptProduction()) {
      vibrate([300, 100, 300, 100, 300]);
      store.measurement.lastProductionPrompt = Date.now();
      store.save();
      const lastReading = store.getLastReading();
      const input = document.getElementById('production-input');
      if (input) input.placeholder = lastReading ? `Última: ${lastReading.value}` : 'Ex: 4500';
      document.getElementById('modal-production')?.classList.remove('hidden');
    }

    if (store.shouldPromptShiftEnd()) {
      vibrate([500, 200, 500]);
      store.markShiftEndPrompted();
      document.getElementById('modal-shift-end')?.classList.remove('hidden');
      startShiftEndCountdown();
    }
  }
}, 1000);

// ============================================================
// INICIALIZAÇÃO
// ============================================================

store.init();
store.applyTheme();
initGlobalModals();
initThemeToggle();

// Oculta navbar e botão de tema até autenticar
navbar?.classList.add('hidden');
if (btnThemeToggle) btnThemeToggle.style.display = 'none';

// Verifica sessão e inicia o app
iniciarApp();