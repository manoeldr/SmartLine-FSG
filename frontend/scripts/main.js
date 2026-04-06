// ============================================================
// MAIN.JS — Ponto de entrada do aplicativo
// Gerencia navegação entre páginas, carregamento dinâmico
// de HTML e inicialização dos módulos de cada tela.
// Também roda o tick global (1x por segundo) pra atualizar timers.
// ============================================================

import { initOverview, updateOverview } from './overview.js';
import { initMedicao, updateMedicao, cleanupMedicao } from './medicao.js';
import { initParadas } from './paradas.js';
import { initConfig } from './config.js';
import { store } from './store.js';
import { vibrate } from './utils.js';

// Referências ao DOM
const container = document.getElementById('page-container');
const navButtons = document.querySelectorAll('.nav-btn');
let currentPage = null; // Página ativa no momento

console.log('main.js carregado', new Date().toISOString());

// Carrega uma página dinamicamente via fetch do HTML
// e inicializa o módulo JS correspondente
async function loadPage(name) {
  console.log('loadPage chamado:', name, 'currentPage:', currentPage, new Error().stack);
  // Evita recarregar a mesma página
  if (currentPage === name) return;

  // Limpa recursos da página anterior (se necessário)
  if (currentPage === 'medicao') cleanupMedicao();

  currentPage = name;

  // Atualiza visual dos botões da navbar (destaca o ativo)
  navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.page === name));

  try {
    // Carrega o HTML da página com cache desativado (vital para o Live Server)
    const resp = await fetch(`pages/${name}.html`, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} - Falha ao carregar página`);

    const html = await resp.text();

    // Guard: se outra navegação ocorreu enquanto o fetch estava pendente, ignora
    if (currentPage !== name) return;

    container.innerHTML = html;

    // Chama a função de inicialização da página carregada
    switch (name) {
      case 'overview': initOverview(); break;
      case 'medicao': initMedicao(); break;
      case 'paradas': initParadas(); break;
      case 'config': initConfig(); break;
    }
  } catch (e) {
    if (currentPage !== name) return;
    console.error('Erro ao carregar página:', e);
    container.innerHTML = `<div class="empty-state"><p>Erro ao carregar página</p></div>`;
  }
}

// Configura os botões da navbar pra navegar entre páginas
navButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    console.log('Nav clicado:', btn.dataset.page, 'target:', e.target, 'currentTarget:', e.currentTarget);
    loadPage(btn.dataset.page);
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

// Expõe clearShiftEndCountdown para medicao.js (handleFinalize)
window._clearShiftEndCountdown = clearShiftEndCountdown;

function initGlobalModals() {
  // Modal produção: confirmar leitura
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

  // Modal fim de turno: finalizar
  document.getElementById('btn-end-shift')?.addEventListener('click', () => {
    clearShiftEndCountdown();
    store.markShiftEndPrompted();
    document.getElementById('modal-shift-end')?.classList.add('hidden');
    store.finalizeMeasurement();
    vibrate([200]);
    loadPage('medicao');
  });

  // Modal fim de turno: estender
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

// Tick global: roda a cada 1 segundo pra atualizar timers,
// verificar fim de turno e solicitar produção
setInterval(() => {
  if (currentPage === 'overview') updateOverview();
  if (currentPage === 'medicao') updateMedicao();

  // Verificações globais independentes da tela ativa
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

// Inicialização do app
store.init();
store.applyTheme();
initGlobalModals();
loadPage('overview');