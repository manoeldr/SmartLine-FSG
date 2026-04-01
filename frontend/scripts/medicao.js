// ============================================================
// MEDICAO.JS — Tela de medição manual
// ============================================================

import { store } from './store.js';
import { api } from './api.js';
import { formatTime, formatTimeMM, vibrate } from './utils.js';

let maquinaSelecionada = null;
let currentMachineAlarms = [];

export function initMedicao() {
  const notConfigured = document.getElementById('med-not-configured');
  const content = document.getElementById('med-content');
  const badge = document.getElementById('med-status-badge');

  const cfg = store.config;
  const configurado = cfg.client && cfg.linhaId && cfg.speed > 0;

  if (!configurado) {
    if (notConfigured) notConfigured.classList.remove('hidden');
    if (content) content.classList.add('hidden');
    if (badge) { badge.textContent = 'Não configurado'; badge.className = 'badge'; }
    return;
  }

  if (notConfigured) notConfigured.classList.add('hidden');
  if (content) content.classList.remove('hidden');

  const m = store.measurement;

  if (m.active && m.started) {
    showActiveScreen();
  } else if (m.state === 'finished') {
    showFinishedScreen();
  } else {
    showPreStartScreen();
  }
}

// ============================================================
// TELAS
// ============================================================

function showPreStartScreen() {
  document.getElementById('med-pre-start')?.classList.remove('hidden');
  document.getElementById('med-active')?.classList.add('hidden');
  document.getElementById('med-finished')?.classList.add('hidden');

  const badge = document.getElementById('med-status-badge');
  if (badge) { badge.textContent = 'Aguardando'; badge.className = 'badge'; }

  replaceWithClone('btn-start-measurement', el => {
    el.addEventListener('click', () => abrirModalIniciar());
  });
}

function showActiveScreen() {
  document.getElementById('med-pre-start')?.classList.add('hidden');
  document.getElementById('med-active')?.classList.remove('hidden');
  document.getElementById('med-finished')?.classList.add('hidden');

  const preStart = document.getElementById('med-pre-start');
  const active = document.getElementById('med-active');
  if (!preStart || !active) return;

  const machineName = document.getElementById('med-machine-name');
  if (machineName) machineName.textContent = store.config.machine;

  updateButtonStates();
  updateMedicao();

  replaceWithClone('btn-marcha',             el => el.addEventListener('click', handleMarcha));
  replaceWithClone('btn-parada',             el => el.addEventListener('click', handleParada));
  replaceWithClone('btn-confirm-production', el => el.addEventListener('click', handleConfirmProduction));
  replaceWithClone('btn-confirm-reason',     el => el.addEventListener('click', handleConfirmReason));
  replaceWithClone('btn-finalize',           el => el.addEventListener('click', () => showFinalizeModal()));
  replaceWithClone('btn-confirm-finalize',   el => el.addEventListener('click', handleFinalize));
  replaceWithClone('btn-cancel-finalize',    el => el.addEventListener('click', () => {
    document.getElementById('modal-finalize')?.classList.add('hidden');
  }));
  replaceWithClone('btn-add-custom-reason', el => el.addEventListener('click', async () => {
    const input = document.getElementById('custom-reason-input');
    const catSelect = document.getElementById('custom-reason-category');
    const name = input?.value.trim();
    const category = catSelect?.value || 'Interna';
    if (!name) return;

    if (!currentMachineAlarms.some(a => a.name === name)) {
      currentMachineAlarms.push({ name, category });
      renderAlarmList(currentMachineAlarms);

      const linhaId = store.config.linhaId;
      const maquinaId = store.config.maquinaLinhaId || (store.config.maquinaId ? Number(store.config.maquinaId) : null);
      if (linhaId && maquinaId) {
        try {
          await api.atualizarMaquina(linhaId, maquinaId, { alarmes: JSON.stringify(currentMachineAlarms) });
        } catch (err) {
          console.warn('Não foi possível salvar alarme de máquina:', err);
        }
      }
    }

    if (input) input.value = '';
  }));
  replaceWithClone('btn-end-shift', el => el.addEventListener('click', () => {
    store.markShiftEndPrompted();
    document.getElementById('modal-shift-end')?.classList.add('hidden');
    setTimeout(() => showFinalizeModal(), 300);
  }));
  replaceWithClone('btn-extend-shift', el => el.addEventListener('click', () => {
    const input = document.getElementById('new-shift-end-input');
    if (input?.value) {
      store.updateConfig({ shiftEnd: input.value });
      store.resetShiftEndPrompted();
    }
    document.getElementById('modal-shift-end')?.classList.add('hidden');
  }));
}

function showFinishedScreen() {
  document.getElementById('med-pre-start')?.classList.add('hidden');
  document.getElementById('med-active')?.classList.add('hidden');
  document.getElementById('med-finished')?.classList.remove('hidden');

  const timerEl = document.getElementById('med-finished-timer');
  const machineEl = document.getElementById('med-finished-machine');
  if (timerEl) timerEl.textContent = formatTime(store.getElapsedMs());
  if (machineEl) machineEl.textContent = `${store.config.machine} — ${store.getDisplayProduction().toLocaleString('pt-BR')} unidades`;

  const badge = document.getElementById('med-status-badge');
  if (badge) { badge.textContent = 'Finalizada'; badge.className = 'badge'; }

  replaceWithClone('btn-nova-medicao', el => {
    el.addEventListener('click', () => {
      store.resetMeasurement();
      maquinaSelecionada = null;
      showPreStartScreen();
    });
  });
}

// ============================================================
// MODAL: INICIAR MEDIÇÃO
// ============================================================

async function abrirModalIniciar() {
  const modal = document.getElementById('modal-iniciar-medicao');
  const list = document.getElementById('modal-maquinas-list');
  const empty = document.getElementById('modal-maquinas-empty');
  if (!modal || !list) return;

  list.innerHTML = '<p style="color:var(--text-dim);font-size:0.875rem;text-align:center;">Carregando...</p>';
  modal.classList.remove('hidden');

  try {
    const linhaId = store.config.linhaId;
    const maquinas = await api.listarMaquinasDisponiveis(linhaId);

    if (maquinas.length === 0) {
      list.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
    } else {
      if (empty) empty.classList.add('hidden');
      list.innerHTML = maquinas.map(m => `
        <div class="alarm-item" data-id="${m.id}" data-nome="${m.nome}" style="justify-content:flex-start;">
          <span style="font-weight:600;margin-right:8px;color:var(--text-dim)">${m.ordem}.</span>
          <span>${m.nome}</span>
        </div>
      `).join('');

      list.querySelectorAll('.alarm-item').forEach(el => {
        el.addEventListener('click', () => {
          list.querySelectorAll('.alarm-item').forEach(e => e.classList.remove('selected'));
          el.classList.add('selected');
        });
      });
    }
  } catch {
    list.innerHTML = '<p style="color:var(--red);font-size:0.875rem;text-align:center;">Erro ao carregar máquinas</p>';
  }

  replaceWithClone('btn-confirmar-inicio', el => {
    el.addEventListener('click', async () => {
      const selected = list.querySelector('.alarm-item.selected');
      if (!selected) {
        list.style.outline = '1px solid var(--red)';
        return;
      }
      const input = document.getElementById('initial-production-input');
      const value = parseInt(input.value);
      if (isNaN(value) || value < 0) {
        input.style.borderColor = 'var(--red)';
        input.focus();
        vibrate([100, 50, 100]);
        return;
      }

      maquinaSelecionada = {
        id: parseInt(selected.dataset.id),
        nome: selected.dataset.nome,
      };

      // Busca detalhes da máquina para pegar alarmes e velocidade nominal
      try {
        const linhaId = store.config.linhaId;
        const todasMaquinas = await api.listarMaquinas(linhaId);
        const maquinaDetalhes = todasMaquinas.find(m => m.id === maquinaSelecionada.id);

        const multiplier = Number(maquinaDetalhes?.multiplicador_produto ?? store.config.productMultiplier ?? 1) || 1;
        const rawSpeed = Number(maquinaDetalhes?.velocidade_nominal ?? store.config.speed) || 0;
        store.updateConfig({
          machine: maquinaSelecionada.nome,
          maquinaId: String(maquinaSelecionada.id),
          maquinaLinhaId: maquinaSelecionada.id,
          speed: rawSpeed,
          productMultiplier: multiplier,
          alarms: maquinaDetalhes?.alarmes ? JSON.parse(maquinaDetalhes.alarmes) : store.config.alarms,
        });
      } catch {
        store.updateConfig({
          machine: maquinaSelecionada.nome,
          maquinaId: String(maquinaSelecionada.id),
          maquinaLinhaId: maquinaSelecionada.id,
        });
      }

      modal.classList.add('hidden');
      input.value = '';
      input.style.borderColor = '';

      store.startMeasurement(value);
      vibrate([100]);
      showActiveScreen();
    });
  });

  replaceWithClone('btn-cancelar-inicio', el => {
    el.addEventListener('click', () => modal.classList.add('hidden'));
  });
}

// ============================================================
// HELPERS
// ============================================================

function replaceWithClone(id, applyListener) {
  const el = document.getElementById(id);
  if (!el) return;
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  applyListener(clone);
}

// ============================================================
// HANDLERS MARCHA / PARADA
// ============================================================

function handleMarcha() {
  const m = store.measurement;
  if (m.state === 'running') return;
  store.setMarcha();
  vibrate([100]);
  updateButtonStates();
  showStopReasonModal().then(reason => {
    const cat = (window._pendingReasonCategory || 'Interna');
    store.setStopReason(reason, cat);
    window._pendingReasonCategory = null;
  });
}

function handleParada() {
  const m = store.measurement;
  if (m.state === 'stopped') return;
  store.setParada();
  vibrate([200, 100, 200]);
  updateButtonStates();
}

// ============================================================
// MODAL: MOTIVO DA PARADA
// ============================================================

async function getCurrentMachineAlarms() {
  const linhaId = store.config.linhaId;
  const maquinaId = store.config.maquinaLinhaId || (store.config.maquinaId ? Number(store.config.maquinaId) : null);
  let alarms = Array.isArray(store.config.alarms) ? store.config.alarms : [];

  if (linhaId && maquinaId) {
    try {
      const maquinas = await api.listarMaquinas(linhaId);
      const maquina = maquinas.find(m => Number(m.id) === Number(maquinaId));
      if (maquina?.alarmes) {
        const parsed = JSON.parse(maquina.alarmes);
        if (Array.isArray(parsed) && parsed.length > 0) {
          alarms = parsed;
        }
      }
    } catch (e) {
      // ignora e usa fallback
    }
  }

  currentMachineAlarms = alarms;
  return alarms;
}

function showStopReasonModal() {
  return new Promise(async resolve => {
    const modal = document.getElementById('modal-stop-reason');
    if (!modal) { resolve('Não informado'); return; }
    const alarms = await getCurrentMachineAlarms();
    renderAlarmList(alarms);
    modal.classList.remove('hidden');
    document.querySelectorAll('#alarm-list-modal .alarm-item').forEach(el => el.classList.remove('selected'));
    window._pendingReasonResolve = resolve;
    window._pendingReasonCategory = null;
  });
}

function renderAlarmList(alarms = store.config.alarms) {
  const list = document.getElementById('alarm-list-modal');
  if (!list) return;
  const categories = {};
  for (const alarm of alarms) {
    const cat = alarm.category || 'Interna';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(alarm.name);
  }
  let html = '';
  for (const [cat, alarmsList] of Object.entries(categories)) {
    html += `<div class="alarm-category-label">${cat}</div>`;
    for (const name of alarmsList) {
      html += `<div class="alarm-item" data-name="${name}" data-category="${cat}">${name}</div>`;
    }
  }
  list.innerHTML = html;
  list.querySelectorAll('.alarm-item').forEach(el => {
    el.addEventListener('click', () => {
      list.querySelectorAll('.alarm-item').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    });
  });
}

function handleConfirmReason() {
  const selected = document.querySelector('#alarm-list-modal .alarm-item.selected');
  const customInput = document.getElementById('custom-reason-input');
  const categorySelect = document.getElementById('custom-reason-category');

  let reason = 'Não informado';
  let category = 'Interna';

  if (selected) {
    reason = selected.dataset.name;
    category = selected.dataset.category || 'Interna';
  } else if (customInput && customInput.value.trim()) {
    reason = customInput.value.trim();
    category = categorySelect?.value || 'Interna';

    if (!currentMachineAlarms.some(a => a.name === reason)) {
      currentMachineAlarms.push({ name: reason, category });
      renderAlarmList(currentMachineAlarms);

      const linhaId = store.config.linhaId;
      const maquinaId = store.config.maquinaLinhaId || (store.config.maquinaId ? Number(store.config.maquinaId) : null);
      if (linhaId && maquinaId) {
        api.atualizarMaquina(linhaId, maquinaId, { alarmes: JSON.stringify(currentMachineAlarms) }).catch(err => {
          console.warn('Não foi possível salvar alarme de máquina:', err);
        });
      }
    }
  }

  if (customInput) customInput.value = '';
  document.getElementById('modal-stop-reason')?.classList.add('hidden');
  if (window._pendingReasonResolve) {
    window._pendingReasonCategory = category;
    window._pendingReasonResolve(reason);
    window._pendingReasonResolve = null;
  }
}

// ============================================================
// MODAL: PRODUÇÃO PERIÓDICA
// ============================================================

function handleConfirmProduction() {
  const input = document.getElementById('production-input');
  const value = parseInt(input.value);
  if (isNaN(value) || value < 0) { input.style.borderColor = 'var(--red)'; return; }
  const lastReading = store.getLastReading();
  if (lastReading && value < lastReading.value) {
    if (!confirm(`Valor (${value}) menor que última leitura (${lastReading.value}). Confirma?`)) return;
  }
  store.addProductionReading(value);
  if (input) { input.value = ''; input.style.borderColor = ''; }
  document.getElementById('modal-production')?.classList.add('hidden');
  vibrate([50]);
}

// ============================================================
// ATUALIZAÇÃO VISUAL DOS BOTÕES
// ============================================================

function updateButtonStates() {
  const m = store.measurement;
  const marchaBtn  = document.getElementById('btn-marcha');
  const paradaBtn  = document.getElementById('btn-parada');
  const stateLabel = document.getElementById('med-state-label');
  const badge      = document.getElementById('med-status-badge');
  if (!marchaBtn || !paradaBtn || !stateLabel || !badge) return;

  if (m.state === 'running') {
    marchaBtn.classList.add('active');
    paradaBtn.classList.remove('active');
    stateLabel.textContent = 'Rodando';
    stateLabel.className = 'med-timer-label running';
    badge.textContent = 'Rodando';
    badge.className = 'badge badge-green';
  } else if (m.state === 'stopped') {
    marchaBtn.classList.remove('active');
    paradaBtn.classList.add('active');
    stateLabel.textContent = 'Parado';
    stateLabel.className = 'med-timer-label stopped';
    badge.textContent = 'Parado';
    badge.className = 'badge badge-red';
  }
}

// ============================================================
// TICK: ATUALIZAÇÃO A CADA SEGUNDO
// ============================================================

export function updateMedicao() {
  const m = store.measurement;
  if (!m.active || !m.started) return;

  const timerEl = document.getElementById('med-timer');
  if (!timerEl) return;

  timerEl.textContent = formatTime(store.getElapsedMs());

  const stopCountEl = document.getElementById('med-stop-count');
  if (stopCountEl) stopCountEl.textContent = store.getStops().length;

  const stopTimeEl = document.getElementById('med-stop-time');
  if (stopTimeEl) stopTimeEl.textContent = formatTimeMM(store.getStoppedMs());

  const prodEl = document.getElementById('med-production');
  if (prodEl) prodEl.textContent = store.getDisplayProduction().toLocaleString('pt-BR');

  const currentStopMs = store.getCurrentStopMs();
  const currentStopEl = document.getElementById('med-current-stop');
  if (currentStopEl) {
    currentStopEl.textContent = formatTimeMM(currentStopMs);
    currentStopEl.style.color = currentStopMs > 0 ? 'var(--red)' : 'var(--text)';
  }

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
  }
}

// ============================================================
// FINALIZAÇÃO
// ============================================================

function showFinalizeModal() {
  const lastReading = store.getLastReading();
  const input = document.getElementById('final-production-input');
  if (input && lastReading) input.placeholder = `Última leitura: ${lastReading.value}`;
  document.getElementById('modal-finalize')?.classList.remove('hidden');
}

function handleFinalize() {
  const input = document.getElementById('final-production-input');
  const value = parseInt(input.value);
  if (!isNaN(value) && value >= 0) {
    store.addProductionReading(value);
  }
  store.finalizeMeasurement();
  vibrate([200]);
  document.getElementById('modal-finalize')?.classList.add('hidden');
  showFinishedScreen();
}

export function cleanupMedicao() {}