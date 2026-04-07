// ============================================================
// MEDICAO.JS — Tela de medição manual
// Gerencia o fluxo completo de uma medição: início, marcha/parada,
// leituras de produção, motivos de parada e finalização.
// ============================================================

import { store } from './store.js';
import { api } from './api.js';
import { formatTime, formatTimeMM, vibrate } from './utils.js';

let maquinaSelecionada = null;
let currentMachineAlarms = [];

// Inicializa a tela de medição. Verifica se o app está configurado
// e exibe a tela correta: pré-início, ativa ou finalizada.
export function initMedicao() {
  const notConfigured = document.getElementById('med-not-configured');
  const content = document.getElementById('med-content');
  const badge = document.getElementById('med-status-badge');

  const m = store.measurement;

  // Medição ativa tem prioridade — mostra tela ativa independente do estado do config
  if (m.active && m.started) {
    if (notConfigured) notConfigured.classList.add('hidden');
    if (content) content.classList.remove('hidden');
    showActiveScreen();
    return;
  }

  if (m.state === 'finished') {
    if (notConfigured) notConfigured.classList.add('hidden');
    if (content) content.classList.remove('hidden');
    showFinishedScreen();
    return;
  }

  const cfg = store.config;
  const configurado = cfg.client && cfg.linhaId;

  if (!configurado) {
    if (notConfigured) notConfigured.classList.remove('hidden');
    if (content) content.classList.add('hidden');
    if (badge) { badge.textContent = 'Não configurado'; badge.className = 'badge'; }
    // Mesmo sem config local, verifica se há medições ativas no backend para retomar
    verificarMedicoesNaoFinalizadas(true);
    return;
  }

  if (notConfigured) notConfigured.classList.add('hidden');
  if (content) content.classList.remove('hidden');
  showPreStartScreen();
}

// ============================================================
// TELAS
// ============================================================

// Exibe a tela de pré-início com o botão "Iniciar medição".
// Também verifica se há medições não finalizadas para exibir o botão "Retomar".
function showPreStartScreen() {
  document.getElementById('med-pre-start')?.classList.remove('hidden');
  document.getElementById('med-active')?.classList.add('hidden');
  document.getElementById('med-finished')?.classList.add('hidden');

  const badge = document.getElementById('med-status-badge');
  if (badge) { badge.textContent = 'Aguardando'; badge.className = 'badge'; }

  // Esconde o botão retomar até confirmar que há medições pendentes
  document.getElementById('btn-retomar-medicao')?.classList.add('hidden');

  replaceWithClone('btn-start-measurement', el => {
    el.addEventListener('click', () => abrirModalIniciar());
  });

  verificarMedicoesNaoFinalizadas();
}

// Exibe a tela de medição ativa com botões de marcha/parada e contadores.
// Configura todos os listeners de botões usando cloneNode para evitar duplicatas.
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

  replaceWithClone('btn-marcha',           el => el.addEventListener('click', handleMarcha));
  replaceWithClone('btn-parada',           el => el.addEventListener('click', handleParada));
  replaceWithClone('btn-confirm-reason',   el => el.addEventListener('click', handleConfirmReason));
  replaceWithClone('btn-finalize',         el => el.addEventListener('click', () => showFinalizeModal()));
  replaceWithClone('btn-confirm-finalize', el => el.addEventListener('click', handleFinalize));
  replaceWithClone('btn-cancel-finalize',  el => el.addEventListener('click', () => {
    document.getElementById('modal-finalize')?.classList.add('hidden');
  }));

  // Botão de adicionar alarme personalizado — salva no backend da máquina
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
      const maquinaId = store.config.maquinaLinhaId;
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

  // Botão de finalizar pelo modal de fim de turno
  replaceWithClone('btn-end-shift', el => el.addEventListener('click', () => {
    clearShiftEndCountdown();
    store.markShiftEndPrompted();
    document.getElementById('modal-shift-end')?.classList.add('hidden');
    setTimeout(() => showFinalizeModal(), 300);
  }));

  // Botão de estender o turno com novo horário de fim
  replaceWithClone('btn-extend-shift', el => el.addEventListener('click', () => {
    clearShiftEndCountdown();
    const input = document.getElementById('new-shift-end-input');
    if (input?.value) {
      store.updateConfig({ shiftEnd: input.value });
      store.resetShiftEndPrompted();
    }
    document.getElementById('modal-shift-end')?.classList.add('hidden');
  }));
}

// Exibe a tela de medição finalizada com resumo de produção e botão de nova medição.
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
// RETOMAR MEDIÇÃO
// ============================================================

// Verifica se há medições não finalizadas. Quando linhaId está disponível, filtra por linha;
// caso contrário (ex: localStorage limpo), busca todas as medições sem filtro.
// Se switchScreen=true e encontrar medições, substitui a tela "não configurado" pelo pré-início.
async function verificarMedicoesNaoFinalizadas(switchScreen = false) {
  const linhaId = store.config.linhaId;

  try {
    const medicoes = await api.listarMedicoes(linhaId ? { linhaId } : {});
    const naoFinalizadas = medicoes.filter(m => !m.timestamp_fim);
    if (naoFinalizadas.length === 0) return;

    if (switchScreen) {
      document.getElementById('med-not-configured')?.classList.add('hidden');
      document.getElementById('med-content')?.classList.remove('hidden');
      document.getElementById('med-pre-start')?.classList.remove('hidden');
      document.getElementById('med-active')?.classList.add('hidden');
      document.getElementById('med-finished')?.classList.add('hidden');
      const badge = document.getElementById('med-status-badge');
      if (badge) { badge.textContent = 'Aguardando'; badge.className = 'badge'; }
      replaceWithClone('btn-start-measurement', el => {
        el.addEventListener('click', () => abrirModalIniciar());
      });
    }

    const btn = document.getElementById('btn-retomar-medicao');
    if (btn) {
      btn.classList.remove('hidden');
      replaceWithClone('btn-retomar-medicao', el => {
        el.addEventListener('click', () => abrirModalRetomar(naoFinalizadas));
      });
    }
  } catch { /* silencioso */ }
}

// Abre o modal com a lista de medições não finalizadas para o auditor escolher qual retomar.
function abrirModalRetomar(medicoes) {
  const modal = document.getElementById('modal-retomar-medicao');
  const list = document.getElementById('modal-retomar-list');
  if (!modal || !list) return;

  list.innerHTML = medicoes.map(m => {
    const inicio = new Date(m.timestamp_inicio).toLocaleString('pt-BR');
    return `
      <div class="alarm-item"
           data-id="${m.id}"
           data-maquina="${m.maquina}"
           data-maquina-linha-id="${m.maquina_linha_id || ''}"
           data-linha-id="${m.linha_id || ''}"
           data-cliente="${m.cliente || ''}"
           data-producao-inicial="${m.producao_inicial}"
           data-turno-inicio="${m.turno_inicio}"
           data-turno-fim="${m.turno_fim}"
           data-velocidade="${m.velocidade_nominal}"
           style="flex-direction:column;align-items:flex-start;gap:2px;padding:12px;">
        <span style="font-weight:600;">${m.maquina}</span>
        <span style="font-size:0.75rem;color:var(--text-dim);">Iniciada em ${inicio}</span>
      </div>
    `;
  }).join('');

  // Ao selecionar uma medição, restaura o estado e vai para a tela ativa
  list.querySelectorAll('.alarm-item').forEach(el => {
    el.addEventListener('click', async () => {
      const medicaoId = parseInt(el.dataset.id);
      await store.restoreFromBackendById(medicaoId, {
        maquina: el.dataset.maquina,
        maquinaLinhaId: el.dataset.maquinaLinhaId ? parseInt(el.dataset.maquinaLinhaId) : null,
        linhaId: el.dataset.linhaId ? parseInt(el.dataset.linhaId) : null,
        cliente: el.dataset.cliente || '',
        producaoInicial: parseInt(el.dataset.producaoInicial),
        turnoInicio: el.dataset.turnoInicio,
        turnoFim: el.dataset.turnoFim,
        velocidade: parseFloat(el.dataset.velocidade),
      });
      modal.classList.add('hidden');
      showActiveScreen();
    });
  });

  replaceWithClone('btn-cancelar-retomar', el => {
    el.addEventListener('click', () => modal.classList.add('hidden'));
  });

  modal.classList.remove('hidden');
}

// ============================================================
// MODAL: INICIAR MEDIÇÃO
// ============================================================

// Abre o modal de início de medição. Carrega as máquinas disponíveis da linha
// e exibe campo para informar a produção inicial do turno.
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

  // Ao confirmar: busca detalhes da máquina, salva no store e inicia medição
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

      // Busca detalhes da máquina: velocidade, multiplicador e alarmes específicos
      try {
        const linhaId = store.config.linhaId;
        const todasMaquinas = await api.listarMaquinas(linhaId);
        const maquinaDetalhes = todasMaquinas.find(m => m.id === maquinaSelecionada.id);

        const multiplier = Number(maquinaDetalhes?.multiplicador_produto ?? store.config.productMultiplier ?? 1) || 1;
        const rawSpeed = Number(maquinaDetalhes?.velocidade_nominal ?? store.config.speed) || 0;

        store.updateConfig({
          machine: maquinaSelecionada.nome,
          maquinaLinhaId: maquinaSelecionada.id,
          speed: rawSpeed,
          productMultiplier: multiplier,
          alarms: maquinaDetalhes?.alarmes ? JSON.parse(maquinaDetalhes.alarmes) : store.config.alarms,
        });
      } catch {
        store.updateConfig({
          machine: maquinaSelecionada.nome,
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

// Substitui um elemento pelo seu clone para remover listeners antigos antes de adicionar novos.
function replaceWithClone(id, applyListener) {
  const el = document.getElementById(id);
  if (!el) return;
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  applyListener(clone);
}

// Limpa o countdown de fim de turno, se existir (delegado ao main.js via window).
function clearShiftEndCountdown() {
  window._clearShiftEndCountdown?.();
}

// ============================================================
// HANDLERS MARCHA / PARADA
// ============================================================

// Registra evento de marcha e abre o modal de motivo da parada anterior.
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

// Registra evento de parada e atualiza o visual dos botões.
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

// Busca os alarmes específicos da máquina ativa no backend.
// Usa os alarmes do store como fallback se a busca falhar.
async function getCurrentMachineAlarms() {
  const linhaId = store.config.linhaId;
  const maquinaId = store.config.maquinaLinhaId;
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
    } catch {
      // ignora e usa fallback
    }
  }

  currentMachineAlarms = alarms;
  return alarms;
}

// Abre o modal de motivo de parada. Retorna uma Promise que resolve
// com o motivo selecionado ou digitado pelo auditor.
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

// Renderiza a lista de alarmes no modal de motivo de parada, agrupada por categoria.
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

// Confirma o motivo de parada selecionado ou digitado.
// Se for um alarme novo, salva na lista da máquina no backend.
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
      const maquinaId = store.config.maquinaLinhaId;
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
// ATUALIZAÇÃO VISUAL DOS BOTÕES
// ============================================================

// Atualiza o visual dos botões de marcha/parada e o badge de status
// de acordo com o estado atual da medição.
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

// Atualiza os contadores da tela ativa: timer, paradas, produção e tempo de parada atual.
// Chamada pelo tick global do main.js a cada segundo.
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
}

// ============================================================
// FINALIZAÇÃO
// ============================================================

// Abre o modal de finalização com a última leitura de produção como placeholder.
function showFinalizeModal() {
  const lastReading = store.getLastReading();
  const input = document.getElementById('final-production-input');
  if (input && lastReading) input.placeholder = `Última leitura: ${lastReading.value}`;
  document.getElementById('modal-finalize')?.classList.remove('hidden');
}

// Finaliza a medição: adiciona leitura final se informada, persiste no backend
// e exibe a tela de medição finalizada.
function handleFinalize() {
  window._clearShiftEndCountdown?.();
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

// Limpa recursos da tela de medição ao navegar para outra página.
export function cleanupMedicao() {}