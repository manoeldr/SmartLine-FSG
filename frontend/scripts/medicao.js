// ============================================================
// MEDICAO.JS — Tela de medição manual
// Controla os botões Marcha/Parada, modais de motivo de parada,
// leitura de produção, fim de turno e finalização da medição.
// ============================================================

import { store } from './store.js';
import { formatTime, formatTimeMM, vibrate } from './utils.js';

// Inicializa a tela de medição
// Verifica se está configurado e se já existe medição ativa
export function initMedicao() {
  const notConfigured = document.getElementById('med-not-configured');
  const content = document.getElementById('med-content');
  const badge = document.getElementById('med-status-badge');

  // Se não configurou cliente/máquina/velocidade, mostra aviso
  if (!store.isConfigured()) {
    if (notConfigured) notConfigured.classList.remove('hidden');
    if (content) content.classList.add('hidden');
    if (badge) {
      badge.textContent = 'Não configurado';
      badge.className = 'badge';
    }
    return;
  }

  if (notConfigured) notConfigured.classList.add('hidden');
  if (content) content.classList.remove('hidden');

  const m = store.measurement;

  // Se já tem medição ativa, mostra tela de medição direto
  // Senão, mostra tela de pré-início (pede produção inicial)
  if (m.active && m.started) {
    showActiveScreen();
  } else if (m.state === 'finished') {
    // Se a medição já foi finalizada, mostra tela de "medição concluída"
    showFinishedScreen();
  } else {
    showPreStartScreen();
  }
}

// Tela pré-início: pede o valor do contador de produção antes de iniciar
function showPreStartScreen() {
  const preStart = document.getElementById('med-pre-start');
  const active = document.getElementById('med-active');
  const machineNamePre = document.getElementById('med-machine-name-pre');
  if (preStart) preStart.classList.remove('hidden');
  if (active) active.classList.add('hidden');
  if (machineNamePre) machineNamePre.textContent = store.config.machine;

  const badge = document.getElementById('med-status-badge');
  if (badge) {
    badge.textContent = 'Aguardando';
    badge.className = 'badge';
  }

  // Usa replaceWithClone para evitar acumular listeners duplicados quando
  // o usuário navega para outra aba e volta sem iniciar a medição
  replaceWithClone('btn-start-measurement', el => {
    el.addEventListener('click', () => {
      const input = document.getElementById('initial-production-input');
      const value = parseInt(input.value);

      // Validação: precisa informar um número válido
      if (isNaN(value) || value < 0) {
        input.style.borderColor = 'var(--red)';
        input.focus();
        vibrate([100, 50, 100]);
        return;
      }

      // Inicia a medição com o valor de produção informado
      store.startMeasurement(value);
      vibrate([100]);
      showActiveScreen();
    });
  });
}

// Tela ativa: botões Marcha/Parada, contadores, botão finalizar
function showActiveScreen() {
  const preStart = document.getElementById('med-pre-start');
  const active   = document.getElementById('med-active');

  // Guard: se os elementos principais não existem, o HTML não foi carregado — aborta
  if (!preStart || !active) {
    console.error('showActiveScreen: elementos principais não encontrados no DOM');
    return;
  }

  preStart.classList.add('hidden');
  active.classList.remove('hidden');
  const machineName = document.getElementById('med-machine-name');
  if (machineName) machineName.textContent = store.config.machine;

  updateButtonStates();
  updateMedicao();

  // Configura listeners usando clones para evitar duplicatas entre re-carregamentos
  replaceWithClone('btn-marcha',           el => el.addEventListener('click', handleMarcha));
  replaceWithClone('btn-parada',           el => el.addEventListener('click', handleParada));
  replaceWithClone('btn-confirm-production', el => el.addEventListener('click', handleConfirmProduction));
  replaceWithClone('btn-confirm-reason',   el => el.addEventListener('click', handleConfirmReason));
  replaceWithClone('btn-finalize',         el => el.addEventListener('click', () => showFinalizeModal()));
  replaceWithClone('btn-confirm-finalize', el => el.addEventListener('click', handleFinalize));
  replaceWithClone('btn-cancel-finalize',  el => el.addEventListener('click', () => {
    const modal = document.getElementById('modal-finalize');
    if (modal) modal.classList.add('hidden');
  }));
  replaceWithClone('btn-add-custom-reason', el => el.addEventListener('click', () => {
    const input = document.getElementById('custom-reason-input');
    if (input.value.trim()) {
      store.addAlarm(input.value.trim(), 'Interna');
      input.value = '';
      renderAlarmList();
    }
  }));
  replaceWithClone('btn-end-shift', el => el.addEventListener('click', () => {
    store.markShiftEndPrompted();
    const modal = document.getElementById('modal-shift-end');
    if (modal) modal.classList.add('hidden');
    setTimeout(() => showFinalizeModal(), 300);
  }));
  replaceWithClone('btn-extend-shift', el => el.addEventListener('click', () => {
    const input = document.getElementById('new-shift-end-input');
    if (input && input.value) {
      store.updateConfig({ shiftEnd: input.value });
      store.resetShiftEndPrompted();
    }
    const modal = document.getElementById('modal-shift-end');
    if (modal) modal.classList.add('hidden');
  }));
}

// Substitui o elemento por um clone sem listeners, depois aplica o callback
// Isso garante que não acumulem listeners duplicados se showActiveScreen for chamada mais de uma vez
function replaceWithClone(id, applyListener) {
  const el = document.getElementById(id);
  if (!el) return;
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  applyListener(clone);
}

// Tela de medição finalizada (quando volta pra aba Medição após encerrar)
function showFinishedScreen() {
  const preStart = document.getElementById('med-pre-start');
  const active = document.getElementById('med-active');
  if (preStart) preStart.classList.add('hidden');
  if (active) {
    active.classList.remove('hidden');
    active.innerHTML = `
      <div class="med-timer">
        <span class="med-timer-label" style="color:var(--brand-light)">Medição finalizada</span>
        <span class="med-timer-value">${formatTime(store.getElapsedMs())}</span>
        <span class="med-timer-sub">${store.config.machine} — ${store.getDisplayProduction().toLocaleString('pt-BR')} unidades</span>
      </div>
      <div class="section-card" style="text-align:center;">
        <p style="color:var(--text-muted);font-size:0.875rem;">Veja os resultados em <strong style="color:var(--brand-light)">Overview</strong> e exporte o JSON</p>
      </div>
    `;
  }
  const badge = document.getElementById('med-status-badge');
  if (badge) {
    badge.textContent = 'Finalizada';
    badge.className = 'badge';
  }
}

// ============================================================
// HANDLERS DOS BOTÕES MARCHA / PARADA
// ============================================================

// Ao clicar MARCHA:
// 1. Muda estado pra 'running' IMEDIATAMENTE (para de contar tempo de parada)
// 2. Só DEPOIS abre o modal pra informar o motivo da parada anterior
// Isso evita que o tempo de seleção do motivo seja contado como parada
function handleMarcha() {
  const m = store.measurement;
  if (m.state === 'running') return; // Já está em marcha

  // Passo 1: muda estado — tempo de parada para de contar AGORA
  store.setMarcha();
  vibrate([100]);
  updateButtonStates();

  // Passo 2: pede o motivo da parada que acabou (não afeta timing)
  showStopReasonModal().then(reason => {
    store.setStopReason(reason);
  });
}

// Ao clicar PARADA: muda estado imediatamente e vibra
function handleParada() {
  const m = store.measurement;
  if (m.state === 'stopped') return; // Já está parado
  store.setParada();
  vibrate([200, 100, 200]); // Vibração mais longa pra parada
  updateButtonStates();
}

// ============================================================
// MODAL: MOTIVO DA PARADA
// ============================================================

// Abre o modal com a lista de alarmes agrupados por categoria
// Retorna uma Promise que resolve com o motivo selecionado
function showStopReasonModal() {
  return new Promise(resolve => {
    const modal = document.getElementById('modal-stop-reason');
    // Guard: se o modal não existe no DOM (ex: página foi trocada durante navegação),
    // resolve imediatamente com "Não informado" sem travar a Promise
    if (!modal) {
      resolve('Não informado');
      return;
    }

    renderAlarmList();
    modal.classList.remove('hidden');
    // Limpa seleção anterior
    document.querySelectorAll('#alarm-list-modal .alarm-item').forEach(el => el.classList.remove('selected'));

    // Guarda a função resolve pra ser chamada quando confirmar
    window._pendingReasonResolve = resolve;
  });
}

// Renderiza a lista de alarmes no modal, agrupados por categoria
function renderAlarmList() {
  const list = document.getElementById('alarm-list-modal');
  if (!list) return;

  // Agrupa alarmes por categoria (Interna, Externa, etc.)
  const categories = {};
  for (const alarm of store.config.alarms) {
    const cat = alarm.category || 'Interna';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(alarm.name);
  }

  // Gera HTML com labels de categoria e itens clicáveis
  let html = '';
  for (const [cat, alarms] of Object.entries(categories)) {
    html += `<div class="alarm-category-label">${cat}</div>`;
    for (const name of alarms) {
      html += `<div class="alarm-item" data-name="${name}">${name}</div>`;
    }
  }
  list.innerHTML = html;

  // Configura seleção: clique seleciona, segundo clique em outro deseleciona o anterior
  list.querySelectorAll('.alarm-item').forEach(el => {
    el.addEventListener('click', () => {
      list.querySelectorAll('.alarm-item').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    });
  });
}

// Confirma o motivo selecionado (ou digitado) e fecha o modal
function handleConfirmReason() {
  const selected = document.querySelector('#alarm-list-modal .alarm-item.selected');
  const customInput = document.getElementById('custom-reason-input');

  // Prioridade: alarme selecionado > texto digitado > "Não informado"
  const reason = selected ? selected.dataset.name : (customInput.value.trim() || 'Não informado');

  // Se digitou um motivo novo, adiciona à lista de alarmes
  if (customInput.value.trim() && !selected) {
    store.addAlarm(customInput.value.trim(), 'Interna');
  }

  if (customInput) customInput.value = '';
  const modal = document.getElementById('modal-stop-reason');
  if (modal) modal.classList.add('hidden');

  // Resolve a Promise do showStopReasonModal
  if (window._pendingReasonResolve) {
    window._pendingReasonResolve(reason);
    window._pendingReasonResolve = null;
  }
}

// ============================================================
// MODAL: LEITURA DE PRODUÇÃO PERIÓDICA
// ============================================================

// Confirma a leitura de produção informada pelo auditor
function handleConfirmProduction() {
  const input = document.getElementById('production-input');
  const value = parseInt(input.value);

  // Validação básica
  if (isNaN(value) || value < 0) { input.style.borderColor = 'var(--red)'; return; }

  // Alerta se o valor é menor que a última leitura (possível erro de digitação)
  const lastReading = store.getLastReading();
  if (lastReading && value < lastReading.value) {
    if (!confirm(`Valor (${value}) menor que última leitura (${lastReading.value}). Confirma?`)) return;
  }

  store.addProductionReading(value);
  if (input) {
    input.value = '';
    input.style.borderColor = '';
  }
  const modal = document.getElementById('modal-production');
  if (modal) modal.classList.add('hidden');
  vibrate([50]);
}

// ============================================================
// ATUALIZAÇÃO VISUAL DOS BOTÕES MARCHA / PARADA
// ============================================================

// Atualiza aparência dos botões e badge conforme estado atual
function updateButtonStates() {
  const m = store.measurement;
  const marchaBtn = document.getElementById('btn-marcha');
  const paradaBtn = document.getElementById('btn-parada');
  const stateLabel = document.getElementById('med-state-label');
  const badge = document.getElementById('med-status-badge');

  if (!marchaBtn || !paradaBtn || !stateLabel || !badge) return;

  if (m.state === 'running') {
    marchaBtn.classList.add('active');    // Botão verde fica destacado
    paradaBtn.classList.remove('active');
    stateLabel.textContent = 'Rodando';
    stateLabel.className = 'med-timer-label running'; // Texto verde
    badge.textContent = 'Rodando';
    badge.className = 'badge badge-green';
  } else if (m.state === 'stopped') {
    marchaBtn.classList.remove('active');
    paradaBtn.classList.add('active');    // Botão vermelho fica destacado
    stateLabel.textContent = 'Parado';
    stateLabel.className = 'med-timer-label stopped'; // Texto vermelho
    badge.textContent = 'Parado';
    badge.className = 'badge badge-red';
  }
}

// ============================================================
// TICK: ATUALIZAÇÃO A CADA SEGUNDO
// ============================================================

// Chamada pelo setInterval do main.js a cada 1 segundo
// Atualiza timers, contadores e verifica se precisa mostrar modais
export function updateMedicao() {
  const m = store.measurement;
  if (!m.active || !m.started) return; // Só atualiza se a medição tá ativa

  const timerEl = document.getElementById('med-timer');
  if (!timerEl) return; // Proteção: se a tela não tá visível

  // Atualiza display dos contadores
  timerEl.textContent = formatTime(store.getElapsedMs());
  
  const stopCountEl = document.getElementById('med-stop-count');
  if (stopCountEl) stopCountEl.textContent = store.getStops().length;

  const stopTimeEl = document.getElementById('med-stop-time');
  if (stopTimeEl) stopTimeEl.textContent = formatTimeMM(store.getStoppedMs());

  const prodEl = document.getElementById('med-production');
  if (prodEl) prodEl.textContent = store.getDisplayProduction().toLocaleString('pt-BR');

  // Timer da parada atual (fica vermelho quando parado)
  const currentStopMs = store.getCurrentStopMs();
  const currentStopEl = document.getElementById('med-current-stop');
  if (currentStopEl) {
    currentStopEl.textContent = formatTimeMM(currentStopMs);
    currentStopEl.style.color = currentStopMs > 0 ? 'var(--red)' : 'var(--text)';
  }

  // Verifica se é hora de pedir leitura de produção
  if (store.shouldPromptProduction()) {
    vibrate([300, 100, 300, 100, 300]); // Vibração tripla pra chamar atenção
    store.measurement.lastProductionPrompt = Date.now();
    store.save();
    const lastReading = store.getLastReading();
    const input = document.getElementById('production-input');
    if (input) input.placeholder = lastReading ? `Última: ${lastReading.value}` : 'Ex: 4500';
    const modal = document.getElementById('modal-production');
    if (modal) modal.classList.remove('hidden');
  }

  // Verifica se atingiu o horário de fim do turno
  if (store.shouldPromptShiftEnd()) {
    vibrate([500, 200, 500]); // Vibração forte pra fim de turno
    store.markShiftEndPrompted();
    const shiftEndModal = document.getElementById('modal-shift-end');
    if (shiftEndModal) shiftEndModal.classList.remove('hidden');
  }
}

// ============================================================
// FINALIZAÇÃO DA MEDIÇÃO
// ============================================================

// Abre o modal de finalização (pede produção final, opcional)
function showFinalizeModal() {
  const lastReading = store.getLastReading();
  const input = document.getElementById('final-production-input');
  if (input && lastReading) {
    input.placeholder = `Última leitura: ${lastReading.value}`;
  }
  const modal = document.getElementById('modal-finalize');
  if (modal) modal.classList.remove('hidden');
}

// Confirma a finalização da medição
// Se o campo de produção tiver valor, salva como última leitura
// Se estiver vazio, finaliza com a última leitura conhecida
function handleFinalize() {
  const input = document.getElementById('final-production-input');
  const value = parseInt(input.value);

  // Se informou valor, registra como leitura final
  if (!isNaN(value) && value >= 0) {
    store.addProductionReading(value);
  }

  // Finaliza: seta active=false, state='finished', registra endTime
  store.finalizeMeasurement();
  vibrate([200]);

  const modal = document.getElementById('modal-finalize');
  if (modal) modal.classList.add('hidden');

  // Substitui conteúdo da tela por mensagem de "finalizada"
  showFinishedScreen();
}

// Cleanup chamado quando o usuário sai da tela de medição
export function cleanupMedicao() {}
