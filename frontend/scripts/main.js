// ============================================================
// MAIN.JS — Ponto de entrada do aplicativo
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
const btnLogout = document.getElementById('btn-logout');
let currentPage = null;
let usuarioAtual = null;

// ============================================================
// AUTENTICAÇÃO
// ============================================================

async function iniciarApp() {
  const token = sessionStorage.getItem('smartline_token');
  const usuarioSalvo = sessionStorage.getItem('smartline_usuario');

  if (token && usuarioSalvo) {
    try {
      const usuario = await api.me();
      usuarioAtual = usuario;
      entrarNoApp(usuario);
    } catch {
      sessionStorage.removeItem('smartline_token');
      sessionStorage.removeItem('smartline_usuario');
      mostrarLogin();
    }
  } else {
    mostrarLogin();
  }
}

function mostrarLogin() {
  navbar?.classList.add('hidden');
  if (btnThemeToggle) btnThemeToggle.style.display = 'none';
  if (btnLogout) btnLogout.style.display = 'none';
  loadPageLogin();
}

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

async function entrarNoApp(usuario) {
  navbar?.classList.remove('hidden');
  if (btnThemeToggle) btnThemeToggle.style.display = '';

  if (btnLogout) {
    btnLogout.style.display = 'flex';
    btnLogout.onclick = () => abrirModalLogout();
  }

  aplicarPermissoesNavbar(usuario.nivel);

  const m = store.measurement;
  if (m.active && m.medicaoId) {
    try {
      const med = await api.getMedicao(m.medicaoId);
      if (med.timestamp_fim || med.usuario_nome !== usuario.nome) {
        store.resetMeasurement();
      }
    } catch {
      store.resetMeasurement();
    }
  }

  const paginaInicial = {
    admin: 'overview',
    auditor: 'overview',
    cliente: 'overview',
  }[usuario.nivel] || 'overview';

  loadPage(paginaInicial);
}

function aplicarPermissoesNavbar(nivel) {
  navButtons.forEach(btn => {
    const page = btn.dataset.page;
    if (nivel === 'cliente') {
      btn.style.display = page === 'overview' ? '' : 'none';
    } else if (nivel === 'auditor') {
      btn.style.display = page === 'config' ? 'none' : '';
    } else {
      btn.style.display = '';
    }
  });
}

function abrirModalLogout() {
  const existing = document.getElementById('modal-logout');
  if (existing) return;

  const modal = document.createElement('div');
  modal.id = 'modal-logout';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="text-align:center;">
      <h3>Sair do sistema</h3>
      <p class="modal-sub">Tem certeza que deseja sair?</p>
      <button class="btn btn-danger btn-block" id="btn-confirmar-logout">Sair</button>
      <button class="btn btn-outline btn-block" id="btn-cancelar-logout" style="margin-top:8px;">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('btn-confirmar-logout').addEventListener('click', () => { modal.remove(); logout(); });
  document.getElementById('btn-cancelar-logout').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function logout() {
  sessionStorage.removeItem('smartline_token');
  sessionStorage.removeItem('smartline_usuario');
  usuarioAtual = null;
  store.resetMeasurement();
  document.getElementById('modal-usuarios')?.remove();
  document.getElementById('modal-config-maquina')?.remove();
  document.getElementById('modal-logout')?.remove();
  mostrarLogin();
}

window.addEventListener('auth:logout', logout);
window.smartlineLogout = logout;
Object.defineProperty(window, 'usuarioAtual', { get: () => usuarioAtual });

// ============================================================
// NAVEGAÇÃO
// ============================================================

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
    container.innerHTML = `<div class="empty-state"><p>Erro ao carregar página</p></div>`;
  }
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
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

function clearShiftEndCountdown() {
  if (shiftEndCountdownInterval) { clearInterval(shiftEndCountdownInterval); shiftEndCountdownInterval = null; }
  if (shiftEndAutoFinalizeTimeout) { clearTimeout(shiftEndAutoFinalizeTimeout); shiftEndAutoFinalizeTimeout = null; }
  const el = document.getElementById('shift-end-countdown');
  if (el) el.textContent = '';
}

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

// Inicializa os listeners dos modais globais.
// O campo de refugo no modal de produção periódica só aparece se
// store.config.temRefugo for true para a máquina em medição.
function initGlobalModals() {
  document.getElementById('btn-confirm-production')?.addEventListener('click', () => {
    const inputProd = document.getElementById('production-input');
    const inputRefugo = document.getElementById('refugo-input');

    const valueProd = parseInt(inputProd.value);
    if (isNaN(valueProd) || valueProd < 0) {
      inputProd.style.borderColor = 'var(--red)';
      return;
    }

    const valueRefugo = inputRefugo?.value.trim() !== '' ? parseInt(inputRefugo.value) : null;

    store.addProductionReading(valueProd, valueRefugo);

    inputProd.value = '';
    inputProd.style.borderColor = '';
    if (inputRefugo) { inputRefugo.value = ''; inputRefugo.style.borderColor = ''; }

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

function atualizarIconeTema() {
  const isDark = store.getTheme() === 'dark';
  const iconSun = document.getElementById('icon-sun');
  const iconMoon = document.getElementById('icon-moon');
  if (iconSun) iconSun.style.display = isDark ? 'block' : 'none';
  if (iconMoon) iconMoon.style.display = isDark ? 'none' : 'block';
}

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

setInterval(() => {
  if (currentPage === 'overview') updateOverview();
  if (currentPage === 'medicao')  updateMedicao();

  if (usuarioAtual && store.measurement.active && store.measurement.medicaoId && usuarioAtual.nivel !== 'cliente') {
    if (store.shouldPromptProduction()) {
      vibrate([300, 100, 300, 100, 300]);

      const intervalMs = (store.config.productionInterval || 60) * 60 * 1000;
      const elapsed = Date.now() - new Date(store.measurement.startTime).getTime();
      store.measurement.lastProductionSlot = Math.floor(elapsed / intervalMs);
      store.save();

      const lastReading = store.getLastReading();
      const inputProd = document.getElementById('production-input');
      const inputRefugo = document.getElementById('refugo-input');
      const refugoGroup = document.getElementById('refugo-group');

      if (inputProd) inputProd.placeholder = lastReading ? `Última: ${lastReading.value}` : 'Ex: 4500';

      // Mostra o campo de refugo apenas se a máquina tiver essa opção habilitada
      const temRefugo = store.config.temRefugo || false;
      if (refugoGroup) refugoGroup.style.display = temRefugo ? '' : 'none';
      if (inputRefugo && temRefugo) {
        inputRefugo.placeholder = lastReading?.refugo != null ? `Último: ${lastReading.refugo}` : 'Ex: 12';
      }

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

navbar?.classList.add('hidden');
if (btnThemeToggle) btnThemeToggle.style.display = 'none';
if (btnLogout) btnLogout.style.display = 'none';

iniciarApp();