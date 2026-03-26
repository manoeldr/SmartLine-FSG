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
    notConfigured.classList.remove('hidden');
    content.classList.add('hidden');
    badge.textContent = 'Não configurado';
    badge.className = 'badge';
    return;
  }

  notConfigured.classList.add('hidden');
  content.classList.remove('hidden');

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
  document.getElementById('med-pre-start').classList.remove('hidden');
  document.getElementById('med-active').classList.add('hidden');
  document.getElementById('med-machine-name-pre').textContent = store.config.machine;

  const badge = document.getElementById('med-status-badge');
  badge.textContent = 'Aguardando';
  badge.className = 'badge';

  document.getElementById('btn-start-measurement').addEventListener('click', () => {
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
}

// Tela ativa: botões Marcha/Parada, contadores, botão finalizar
function showActiveScreen() {
  document.getElementById('med-pre-start').classList.add('hidden');
  document.getElementById('med-active').classList.remove('hidden');
  document.getElementById('med-machine-name').textContent = store.config.machine;

  updateButtonStates();
  updateMedicao();

  // Configura listeners dos botões principais
  document.getElementById('btn-marcha').addEventListener('click', handleMarcha);
  document.getElementById('btn-parada').addEventListener('click', handleParada);
  document.getElementById('btn-confirm-production').addEventListener('click', handleConfirmProduction);
  document.getElementById('btn-confirm-reason').addEventListener('click', handleConfirmReason);

  // Botão "+" no modal de motivo: adiciona alarme personalizado
  document.getElementById('btn-add-custom-reason').addEventListener('click', () => {
    const input = document.getElementById('custom-reason-input');
    if (input.value.trim()) {
      store.addAlarm(input.value.trim(), 'Interna');
      input.value = '';
      renderAlarmList();
    }
  });

  // Modal de fim de turno: botão "Finalizar medição"
  document.getElementById('btn-end-shift').addEventListener('click', () => {
    store.markShiftEndPrompted();
    document.getElementById('modal-shift-end').classList.add('hidden');
    // Pequeno delay pra fechar um modal antes de abrir outro
    setTimeout(() => showFinalizeModal(), 300);
  });

  // Modal de fim de turno: botão "Estender turno" (define novo horário)
  document.getElementById('btn-extend-shift').addEventListener('click', () => {
    const newEnd = document.getElementById('new-shift-end-input').value;
    if (newEnd) {
      store.updateConfig({ shiftEnd: newEnd });
      store.resetShiftEndPrompted(); // Permite que o alerta dispare novamente no novo horário
    }
    document.getElementById('modal-shift-end').classList.add('hidden');
  });

  // Botão "Finalizar medição" na tela (sempre visível abaixo dos contadores)
  document.getElementById('btn-finalize').addEventListener('click', () => showFinalizeModal());

  // Modal de finalização: confirmar e cancelar
  document.getElementById('btn-confirm-finalize').addEventListener('click', handleFinalize);
  document.getElementById('btn-cancel-finalize').addEventListener('click', () => {
    document.getElementById('modal-finalize').classList.add('hidden');
  });
}

// Tela de medição finalizada (quando volta pra aba Medição após encerrar)
function showFinishedScreen() {
  document.getElementById('med-pre-start').classList.add('hidden');
  document.getElementById('med-active').classList.remove('hidden');
  document.getElementById('med-active').innerHTML = `
    <div class="med-timer">
      <span class="med-timer-label" style="color:var(--brand-light)">Medição finalizada</span>
      <span class="med-timer-value">${formatTime(store.getElapsedMs())}</span>
      <span class="med-timer-sub">${store.config.machine} — ${store.getDisplayProduction().toLocaleString('pt-BR')} unidades</span>
    </div>
    <div class="section-card" style="text-align:center;">
      <p style="color:var(--text-muted);font-size:0.875rem;">Veja os resultados em <strong style="color:var(--brand-light)">Overview</strong> e exporte o JSON</p>
    </div>
  `;
  const badge = document.getElementById('med-status-badge');
  badge.textContent = 'Finalizada';
  badge.className = 'badge';
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
    renderAlarmList();
    document.getElementById('modal-stop-reason').classList.remove('hidden');
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

  customInput.value = '';
  document.getElementById('modal-stop-reason').classList.add('hidden');

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
  input.value = '';
  input.style.borderColor = '';
  document.getElementById('modal-production').classList.add('hidden');
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
  document.getElementById('med-stop-count').textContent = store.getStops().length;
  document.getElementById('med-stop-time').textContent = formatTimeMM(store.getStoppedMs());
  document.getElementById('med-production').textContent = store.getDisplayProduction().toLocaleString('pt-BR');

  // Timer da parada atual (fica vermelho quando parado)
  const currentStopMs = store.getCurrentStopMs();
  const currentStopEl = document.getElementById('med-current-stop');
  currentStopEl.textContent = formatTimeMM(currentStopMs);
  currentStopEl.style.color = currentStopMs > 0 ? 'var(--red)' : 'var(--text)';

  // Verifica se é hora de pedir leitura de produção
  if (store.shouldPromptProduction()) {
    vibrate([300, 100, 300, 100, 300]); // Vibração tripla pra chamar atenção
    store.measurement.lastProductionPrompt = Date.now();
    store.save();
    const lastReading = store.getLastReading();
    const input = document.getElementById('production-input');
    if (input) input.placeholder = lastReading ? `Última: ${lastReading.value}` : 'Ex: 4500';
    document.getElementById('modal-production').classList.remove('hidden');
  }

  // Verifica se atingiu o horário de fim do turno
  if (store.shouldPromptShiftEnd()) {
    vibrate([500, 200, 500]); // Vibração forte pra fim de turno
    store.markShiftEndPrompted();
    document.getElementById('modal-shift-end').classList.remove('hidden');
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
  document.getElementById('modal-finalize').classList.remove('hidden');
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

  document.getElementById('modal-finalize').classList.add('hidden');

  // Substitui conteúdo da tela por mensagem de "finalizada"
  showFinishedScreen();
}

// Cleanup chamado quando o usuário sai da tela de medição
export function cleanupMedicao() {}
