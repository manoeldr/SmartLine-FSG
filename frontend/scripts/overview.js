// ============================================================
// OVERVIEW.JS — Tela de visão geral da linha de produção
// Mostra fluxo da linha, KPIs da máquina crítica e modal
// de detalhes por máquina. Suporta dados em tempo real e histórico.
// ============================================================

import { store } from './store.js';
import { api } from './api.js';
import { formatTime, formatTimeMM, formatPercent } from './utils.js';

const PIE_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e', '#8b5cf6', '#ec4899'];

let productionChart = null;
let modalPieChart = null;
let ultimoStatus = [];
let filtrosAtivos = {};
let lastFluxoUpdateTime = 0;

const FLUXO_UPDATE_INTERVAL_MS = 30_000;

// Inicializa a tela de overview. Carrega dados em tempo real ou histórico.
export async function initOverview() {
  productionChart = null;
  modalPieChart = null;
  ultimoStatus = [];
  filtrosAtivos = {};
  lastFluxoUpdateTime = 0;

  iniciarClock();
  inicializarFiltros();
  configurarFiltroUI();
  await renderFluxoLinha();
  await carregarDadosCritica();
  lastFluxoUpdateTime = Date.now();
}

// Atualiza a tela a cada segundo (chamada pelo tick global do main.js).
export async function updateOverview() {
  atualizarClock();
  const now = Date.now();
  if (now - lastFluxoUpdateTime >= FLUXO_UPDATE_INTERVAL_MS) {
    lastFluxoUpdateTime = now;
    await renderFluxoLinha();
    await carregarDadosCritica();
  }
}

// ============================================================
// CLOCK
// ============================================================

// Inicia o relógio no header.
function iniciarClock() { atualizarClock(); }

// Atualiza o horário exibido no header.
function atualizarClock() {
  const el = document.getElementById('ov-clock');
  if (el) el.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// FILTROS
// ============================================================

// Popula os selects de filtro com dados reais do backend.
async function inicializarFiltros() {
  const linhaId = store.config.linhaId;
  if (!linhaId) return;

  try {
    const [maquinas, filtros] = await Promise.all([
      api.listarMaquinas(linhaId),
      api.filtrosDisponiveis(linhaId),
    ]);

    const selMaquina = document.getElementById('ov-filter-maquina');
    if (selMaquina) {
      selMaquina.innerHTML = '<option value="">Todas</option>';
      maquinas.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.nome;
        selMaquina.appendChild(opt);
      });
    }

    const selTurno = document.getElementById('ov-filter-turno');
    if (selTurno) {
      selTurno.innerHTML = '<option value="">Todos</option>';
      filtros.turnos.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        selTurno.appendChild(opt);
      });
    }

    const selData = document.getElementById('ov-filter-data');
    if (selData) {
      selData.innerHTML = '<option value="">Todas</option>';
      filtros.datas.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
        selData.appendChild(opt);
      });
    }
  } catch { /* silencioso */ }
}

// Configura os listeners dos botões de filtro.
function configurarFiltroUI() {
  const filterBtn = document.getElementById('ov-filter-btn');
  const filterPanel = document.getElementById('ov-filter-panel');

  filterBtn?.addEventListener('click', () => {
    filterPanel?.classList.toggle('hidden');
    filterBtn.classList.toggle('active');
  });

  document.getElementById('ov-filter-aplicar')?.addEventListener('click', async () => {
    const linhaId = store.config.linhaId;
    const maquinaId = document.getElementById('ov-filter-maquina')?.value;
    const turno = document.getElementById('ov-filter-turno')?.value;
    const data = document.getElementById('ov-filter-data')?.value;

    filtrosAtivos = { linhaId };
    if (maquinaId) filtrosAtivos.maquinaLinhaId = maquinaId;
    if (turno) filtrosAtivos.turnoInicio = turno;
    if (data) { filtrosAtivos.dataInicio = data; filtrosAtivos.dataFim = data; }

    filterPanel?.classList.add('hidden');
    filterBtn?.classList.toggle('active', !!(maquinaId || turno || data));
    await carregarDadosCritica();
  });

  document.getElementById('ov-filter-limpar')?.addEventListener('click', async () => {
    filtrosAtivos = {};
    ['ov-filter-maquina', 'ov-filter-turno', 'ov-filter-data']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    filterBtn?.classList.remove('active');
    filterPanel?.classList.add('hidden');
    await carregarDadosCritica();
  });
}

// ============================================================
// DADOS DA MÁQUINA CRÍTICA
// ============================================================

// Busca e exibe os dados da máquina crítica (tempo real ou filtrado).
async function carregarDadosCritica() {
  const linhaId = store.config.linhaId;
  if (!linhaId) {
    document.getElementById('ov-no-data')?.classList.remove('hidden');
    document.getElementById('ov-content')?.classList.add('hidden');
    return;
  }

  try {
    const status = await api.statusLinha(linhaId);
    ultimoStatus = status;

    const headerInfo = document.getElementById('ov-header-info');
    if (headerInfo) headerInfo.textContent = `${store.config.client || '—'} · ${store.config.machine || 'Linha'}`;

    const critica = status.find(m => m.critica);

    if (!critica) {
      document.getElementById('ov-critica-nome').textContent = 'Não definida';
      limparKPIs();
      return;
    }

    document.getElementById('ov-critica-nome').textContent = critica.maquina_nome;

    const velNominalEl = document.getElementById('ov-vel-nominal');
    if (velNominalEl) velNominalEl.textContent = critica.velocidade ? critica.velocidade.toLocaleString('pt-BR') : '—';

    const producaoEl = document.getElementById('ov-production');
    if (producaoEl) producaoEl.textContent = critica.producao !== null && critica.producao !== undefined
      ? critica.producao.toLocaleString('pt-BR') : '—';

    const eficienciaEl = document.getElementById('ov-efficiency');
    if (eficienciaEl) eficienciaEl.textContent = critica.eficiencia !== null ? `${critica.eficiencia}%` : '—';

    if (critica.estado !== 'sem_informacao') {
      const medicoes = await api.listarMedicoes({
        linhaId,
        maquinaLinhaId: critica.maquina_id,
        ...filtrosAtivos,
      });

      if (medicoes.length > 0) {
        calcularEExibirIndicadores(medicoes[0], critica);
        renderBarChart(medicoes[0]);
      }
    } else {
      limparIndicadores();
    }
  } catch (e) {
    console.warn('[overview] Erro ao carregar dados:', e);
  }
}

// Calcula e exibe MTBF, MTTR, disponibilidade, performance e OEE a partir da medição.
function calcularEExibirIndicadores(medicao, critica) {
  const eventos = medicao.eventos || [];
  const startTime = new Date(medicao.timestamp_inicio);
  const endTime = medicao.timestamp_fim ? new Date(medicao.timestamp_fim) : new Date();
  const elapsed = endTime - startTime;

  let stoppedMs = 0, stopTime = null, numParadas = 0;
  for (const ev of eventos) {
    if (ev.tipo === 'parada') { stopTime = new Date(ev.timestamp); numParadas++; }
    else if (ev.tipo === 'marcha' && stopTime) { stoppedMs += new Date(ev.timestamp) - stopTime; stopTime = null; }
  }
  if (stopTime) stoppedMs += endTime - stopTime;

  const runningMs = Math.max(0, elapsed - stoppedMs);
  const availability = elapsed > 0 ? (runningMs / elapsed) * 100 : 0;
  const prodReadings = eventos.filter(e => e.tipo === 'producao' && e.producao_leitura !== null);
  const lastProd = prodReadings.length > 0 ? prodReadings[prodReadings.length - 1].producao_leitura : medicao.producao_inicial;
  const oeeProd = lastProd - medicao.producao_inicial;
  const runningHours = runningMs / 3600000;
  const expectedOutput = runningHours * (medicao.velocidade_nominal || critica?.velocidade || 1);
  const performance = expectedOutput > 0 ? Math.min((oeeProd / expectedOutput) * 100, 100) : 0;
  const oee = (availability / 100) * (performance / 100) * 100;
  const mtbf = numParadas > 0 ? runningMs / numParadas : null;
  const mttr = numParadas > 0 ? stoppedMs / numParadas : null;

  document.getElementById('ov-total-stops').textContent = numParadas;
  document.getElementById('ov-mtbf').textContent = mtbf ? formatTimeMM(mtbf) : '—';
  document.getElementById('ov-mttr').textContent = mttr ? formatTimeMM(mttr) : '—';
  document.getElementById('ov-availability').textContent = formatPercent(availability);
  document.getElementById('ov-performance').textContent = formatPercent(performance);
  document.getElementById('ov-oee').textContent = formatPercent(oee);
}

// Limpa os KPIs quando não há máquina crítica definida.
function limparKPIs() {
  ['ov-vel-nominal', 'ov-production', 'ov-efficiency', 'ov-total-stops'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '—';
  });
  limparIndicadores();
}

// Limpa os indicadores calculados.
function limparIndicadores() {
  ['ov-mtbf', 'ov-mttr', 'ov-availability', 'ov-performance', 'ov-oee'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '—';
  });
}

// ============================================================
// GRÁFICO DE BARRAS — PRODUÇÃO TEMPO REAL
// ============================================================

// Renderiza o gráfico de barras de produção real vs nominal da máquina crítica.
function renderBarChart(medicao) {
  const canvas = document.getElementById('ov-production-chart');
  const emptyEl = document.getElementById('ov-chart-empty');
  if (!canvas) return;

  const eventos = medicao.eventos || [];
  const readings = eventos
    .filter(e => e.tipo === 'producao' && e.producao_leitura !== null)
    .map(e => ({ time: e.timestamp, value: e.producao_leitura }));

  if (readings.length === 0) {
    canvas.style.display = 'none';
    emptyEl?.classList.remove('hidden');
    return;
  }

  canvas.style.display = 'block';
  emptyEl?.classList.add('hidden');

  const startTime = new Date(medicao.timestamp_inicio).getTime();
  const speed = medicao.velocidade_nominal || 0;
  const initialProd = medicao.producao_inicial || 0;

  const realValues = readings.map(r => r.value - initialProd);
  const nominalValues = readings.map(r => {
    const elapsedMin = (new Date(r.time).getTime() - startTime) / 60000;
    return Math.round((speed / 60) * elapsedMin);
  });
  const labels = readings.map(r => {
    const min = Math.round((new Date(r.time).getTime() - startTime) / 60000);
    return `${min}min`;
  });

  if (productionChart) {
    productionChart.data.labels = labels;
    productionChart.data.datasets[0].data = realValues;
    productionChart.data.datasets[1].data = nominalValues;
    productionChart.update('none');
    return;
  }

  productionChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Real',
          data: realValues,
          backgroundColor: 'rgba(59,130,246,0.7)',
          borderRadius: 4,
        },
        {
          label: 'Nominal',
          data: nominalValues,
          type: 'line',
          borderColor: '#22c55e',
          borderDash: [6, 3],
          backgroundColor: 'transparent',
          fill: false,
          tension: 0,
          pointRadius: 0,
          borderWidth: 2,
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 12 }, usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y?.toLocaleString('pt-BR')} un` } }
      },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(148,163,184,0.08)' } },
        y: {
          ticks: { color: '#94a3b8', font: { size: 11 } },
          grid: { color: 'rgba(148,163,184,0.08)' },
          beginAtZero: true,
          title: { display: true, text: 'unidades', color: '#64748b', font: { size: 11 } }
        }
      }
    }
  });
}

// ============================================================
// FLUXO DA LINHA
// ============================================================

// Renderiza o fluxo visual da linha. Cada máquina é clicável e abre o modal de detalhes.
async function renderFluxoLinha() {
  const container = document.getElementById('ov-fluxo-linha');
  if (!container) return;

  const linhaId = store.config.linhaId;
  if (!linhaId) {
    container.innerHTML = '<p class="empty-state-sm">Linha não configurada</p>';
    return;
  }

  try {
    const status = await api.statusLinha(linhaId);
    ultimoStatus = status;

    if (status.length === 0) {
      container.innerHTML = '<p class="empty-state-sm">Nenhuma máquina cadastrada</p>';
      return;
    }

    container.innerHTML = status.map((m, i) => {
      const abrev = m.maquina_nome.substring(0, 4).toUpperCase();
      const estado = m.estado;
      const efText = m.eficiencia !== null ? `${m.eficiencia}%` : '—';
      const criticaStar = m.critica
        ? '<span style="position:absolute;top:3px;left:5px;color:var(--brand);font-size:0.6rem;font-weight:700;">★</span>'
        : '';
      const seta = i < status.length - 1
        ? `<span class="fluxo-seta ${estado}">→</span>`
        : '';
      return `
        <div class="fluxo-maquina" data-maquina-id="${m.maquina_id}">
          <div class="fluxo-maquina-box ${estado}">
            ${criticaStar}
            <span class="fluxo-maquina-dot ${estado}"></span>
            ${abrev}
          </div>
          <span class="fluxo-maquina-nome">${m.maquina_nome}</span>
          <span class="fluxo-maquina-eficiencia ${estado}">${efText}</span>
        </div>
        ${seta}
      `;
    }).join('');

    container.querySelectorAll('.fluxo-maquina').forEach(el => {
      el.addEventListener('click', () => {
        const maquinaId = parseInt(el.dataset.maquinaId);
        const maquina = ultimoStatus.find(m => m.maquina_id === maquinaId);
        if (maquina) abrirModalMaquina(maquina);
      });
    });

  } catch {
    container.innerHTML = '<p class="empty-state-sm">Erro ao carregar fluxo</p>';
  }
}

// ============================================================
// MODAL: DETALHES DA MÁQUINA
// ============================================================

// Abre o modal bottom sheet com os detalhes completos de uma máquina.
async function abrirModalMaquina(maquina) {
  const modal = document.getElementById('modal-maquina-detalhes');
  if (!modal) return;

  // Header
  const dot = document.getElementById('modal-maq-dot');
  if (dot) dot.className = `status-dot-inline ${maquina.estado}`;
  document.getElementById('modal-maq-nome').textContent = maquina.maquina_nome;

  const statusLabels = { rodando: 'Rodando', parado: 'Parada', sem_informacao: 'Sem informação', ultima_medicao: 'Última medição' };
  document.getElementById('modal-maq-sub').textContent = statusLabels[maquina.estado] || '—';

  // KPIs básicos do status
  document.getElementById('modal-maq-producao').textContent = maquina.producao !== null && maquina.producao !== undefined
    ? maquina.producao.toLocaleString('pt-BR') : '—';
  document.getElementById('modal-maq-eficiencia').textContent = maquina.eficiencia !== null ? `${maquina.eficiencia}%` : '—';
  document.getElementById('modal-maq-tempo-parado').textContent = maquina.tempo_parado_ms ? formatTimeMM(maquina.tempo_parado_ms) : '—';
  document.getElementById('modal-maq-mtbf').textContent = maquina.mtbf_ms ? formatTimeMM(maquina.mtbf_ms) : '—';
  document.getElementById('modal-maq-mttr').textContent = maquina.mttr_ms ? formatTimeMM(maquina.mttr_ms) : '—';
  document.getElementById('modal-maq-oee').textContent = '—';

  // Limpa conteúdo anterior
  document.getElementById('modal-maq-eventos').innerHTML = '';
  document.getElementById('modal-maq-no-eventos')?.classList.add('hidden');
  document.getElementById('modal-maq-no-stops')?.classList.add('hidden');
  document.getElementById('modal-donut-inner')?.classList.remove('hidden');

  // Fecha ao clicar no overlay
  modal.onclick = (e) => { if (e.target === modal) fecharModal(); };

  const btnFechar = document.getElementById('modal-maq-fechar');
  const novoBtn = btnFechar.cloneNode(true);
  btnFechar.parentNode.replaceChild(novoBtn, btnFechar);
  novoBtn.addEventListener('click', fecharModal);

  modal.classList.remove('hidden');

  // Busca medição da máquina para enriquecer com dados calculados
  try {
    const medicoes = await api.listarMedicoes({
      linhaId: store.config.linhaId,
      maquinaLinhaId: maquina.maquina_id,
    });

    if (medicoes.length > 0) {
      const medicao = medicoes[0];
      const eventos = medicao.eventos || [];
      const startTime = new Date(medicao.timestamp_inicio);
      const endTime = medicao.timestamp_fim ? new Date(medicao.timestamp_fim) : new Date();
      const elapsed = endTime - startTime;

      // Calcula OEE
      let stoppedMs = 0, stopTime = null, numParadas = 0;
      for (const ev of eventos) {
        if (ev.tipo === 'parada') { stopTime = new Date(ev.timestamp); numParadas++; }
        else if (ev.tipo === 'marcha' && stopTime) { stoppedMs += new Date(ev.timestamp) - stopTime; stopTime = null; }
      }
      if (stopTime) stoppedMs += endTime - stopTime;

      const runningMs = Math.max(0, elapsed - stoppedMs);
      const availability = elapsed > 0 ? (runningMs / elapsed) * 100 : 0;
      const prodReadings = eventos.filter(e => e.tipo === 'producao' && e.producao_leitura !== null);
      const lastProd = prodReadings.length > 0 ? prodReadings[prodReadings.length - 1].producao_leitura : medicao.producao_inicial;
      const oeeProd = lastProd - medicao.producao_inicial;
      const runningHours = runningMs / 3600000;
      const expectedOutput = runningHours * (medicao.velocidade_nominal || 1);
      const performance = expectedOutput > 0 ? Math.min((oeeProd / expectedOutput) * 100, 100) : 0;
      const oee = (availability / 100) * (performance / 100) * 100;
      document.getElementById('modal-maq-oee').textContent = formatPercent(oee);

      renderModalDonut(eventos, endTime, stoppedMs);
      renderModalEventos(eventos, startTime);
    }
  } catch (e) {
    console.warn('[modal] Erro ao carregar detalhes:', e);
  }
}

// Fecha o modal de detalhes da máquina.
function fecharModal() {
  document.getElementById('modal-maquina-detalhes')?.classList.add('hidden');
  if (modalPieChart) { modalPieChart.destroy(); modalPieChart = null; }
}

// Renderiza o gráfico donut de paradas por motivo com tempo total no centro.
function renderModalDonut(eventos, endTime, totalStoppedMs) {
  const canvas = document.getElementById('modal-maq-pie');
  const legend = document.getElementById('modal-maq-pie-legend');
  const noStops = document.getElementById('modal-maq-no-stops');
  const inner = document.getElementById('modal-donut-inner');
  if (!canvas) return;

  if (modalPieChart) { modalPieChart.destroy(); modalPieChart = null; }

  // Agrupa paradas por motivo com duração
  const byMotivo = {};
  for (let i = 0; i < eventos.length; i++) {
    if (eventos[i].tipo === 'parada') {
      const motivo = eventos[i].motivo || 'Não informado';
      const next = eventos.find((e, j) => j > i && e.tipo === 'marcha');
      const start = new Date(eventos[i].timestamp);
      const end = next ? new Date(next.timestamp) : endTime;
      const durationMs = end - start;
      if (!byMotivo[motivo]) byMotivo[motivo] = { count: 0, totalMs: 0 };
      byMotivo[motivo].count++;
      byMotivo[motivo].totalMs += durationMs;
    }
  }

  const entries = Object.entries(byMotivo);

  if (entries.length === 0) {
    inner?.classList.add('hidden');
    noStops?.classList.remove('hidden');
    return;
  }

  inner?.classList.remove('hidden');
  noStops?.classList.add('hidden');

  const total = entries.reduce((s, [, v]) => s + v.totalMs, 0);

  // Texto no centro do donut — tempo total parado
  document.getElementById('modal-donut-time').textContent = formatTimeMM(totalStoppedMs);
  document.getElementById('modal-donut-pct').textContent = `${entries.reduce((s, [, v]) => s + v.count, 0)} paradas`;

  modalPieChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: entries.map(([k]) => k),
      datasets: [{
        data: entries.map(([, v]) => v.totalMs),
        backgroundColor: PIE_COLORS,
        borderWidth: 0,
        hoverOffset: 4,
      }]
    },
    options: {
      responsive: false,
      animation: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const mins = Math.floor(ctx.parsed / 60000);
              const pct = Math.round((ctx.parsed / total) * 100);
              return `${ctx.label}: ${mins}min (${pct}%)`;
            }
          }
        }
      }
    }
  });

  // Legenda com nome + tempo · percentual
  legend.innerHTML = entries.map(([motivo, data], i) => {
    const pct = Math.round((data.totalMs / total) * 100);
    const mins = Math.floor(data.totalMs / 60000);
    const secs = Math.floor((data.totalMs % 60000) / 1000);
    const tempoStr = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    return `
      <div class="modal-donut-legend-item">
        <div class="modal-donut-legend-row">
          <span class="modal-donut-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
          <span class="modal-donut-legend-nome">${motivo}</span>
        </div>
        <span class="modal-donut-legend-detalhe">${tempoStr} · ${pct}%</span>
      </div>
    `;
  }).join('');
}

// Renderiza a timeline de eventos recentes no modal.
// Mostra horário, ícone por tipo e motivo quando disponível.
function renderModalEventos(eventos, startTime) {
  const container = document.getElementById('modal-maq-eventos');
  const noEventos = document.getElementById('modal-maq-no-eventos');
  if (!container) return;

  // Filtra e ordena eventos relevantes (últimos 10, mais recentes primeiro)
  const relevantes = [...eventos]
    .filter(e => ['parada', 'marcha', 'producao'].includes(e.tipo))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);

  if (relevantes.length === 0) {
    container.innerHTML = '';
    noEventos?.classList.remove('hidden');
    return;
  }

  noEventos?.classList.add('hidden');

  const iconePorTipo = {
    parada: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`,
    marcha: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    producao: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  };

  const labelPorTipo = { parada: 'Parada', marcha: 'Rodando', producao: 'Produção' };

  container.innerHTML = relevantes.map(ev => {
    const hora = new Date(ev.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const icone = iconePorTipo[ev.tipo] || '';
    const label = labelPorTipo[ev.tipo] || ev.tipo;
    let motivo = '';
    if (ev.tipo === 'parada') motivo = ev.motivo || 'Sem informação';
    if (ev.tipo === 'marcha') motivo = 'Retomada';
    if (ev.tipo === 'producao') motivo = `${ev.producao_leitura?.toLocaleString('pt-BR') || '—'} un`;

    return `
      <div class="evento-item">
        <span class="evento-hora">${hora}</span>
        <div class="evento-icone ${ev.tipo}">${icone}</div>
        <div class="evento-body">
          <div class="evento-tipo">${label}</div>
          ${motivo ? `<div class="evento-motivo">${motivo}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}