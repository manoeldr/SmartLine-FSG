// ============================================================
// OVERVIEW.JS — Tela de overview (visão geral da medição)
// ============================================================

import { store } from './store.js';
import { api } from './api.js';
import { formatTime, formatTimeMM, formatPercent } from './utils.js';

const PIE_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e', '#8b5cf6', '#ec4899'];
let productionChart = null;
let ultimoStatus = [];
let filtrosAtivos = {};
let maquinasLinha = [];
let isShowingFiltered = false;

export function initOverview() {
  const m = store.measurement;
  const noData = document.getElementById('ov-no-data');
  const content = document.getElementById('ov-content');
  const badge = document.getElementById('ov-status-badge');

  productionChart = null;
  ultimoStatus = [];
  filtrosAtivos = {};
  isShowingFiltered = false;

  if (!m.active && m.state !== 'finished') {
    // Try to load last measurement
    (async () => {
      try {
        const allMedicoes = await api.listarMedicoes({ linhaId: store.config.linhaId });
        if (allMedicoes.length > 0) {
          const medicao = await api.getMedicao(allMedicoes[0].id);
          updateOverviewFromMedicao(medicao);
          isShowingFiltered = true;
          noData.classList.add('hidden');
          content.classList.remove('hidden');
        }
      } catch {}
    })();
    return;
  }

  noData.classList.add('hidden');
  content.classList.remove('hidden');

  if (m.state === 'running') {
    badge.textContent = 'Rodando'; badge.className = 'badge badge-green';
  } else if (m.state === 'stopped') {
    badge.textContent = 'Parado'; badge.className = 'badge badge-red';
  } else if (m.state === 'finished') {
    badge.textContent = 'Finalizada'; badge.className = 'badge';
  }

  document.getElementById('ov-client').textContent = store.config.client || '—';
  document.getElementById('ov-machine').textContent = store.config.machine || '—';
  document.getElementById('ov-shift').textContent = `${store.config.shiftStart} - ${store.config.shiftEnd}`;

  const exportBtn = document.getElementById('ov-export-btn');
  if (exportBtn) {
    exportBtn.onclick = () => {
      const json = store.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `auditoria_${store.config.client || 'export'}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  // Toggle do painel de filtros
  const filterBtn = document.getElementById('ov-filter-btn');
  const filterPanel = document.getElementById('ov-filter-panel');
  if (filterBtn) {
    filterBtn.onclick = () => {
      filterPanel?.classList.toggle('hidden');
      filterBtn.classList.toggle('active');
    };
  }

  // Aplicar filtros
  const btnAplicar = document.getElementById('ov-filter-aplicar');
  if (btnAplicar) {
    btnAplicar.onclick = async () => {
      const linhaId = store.config.linhaId;
      const maquinaId = document.getElementById('ov-filter-maquina')?.value;
      const cliente = document.getElementById('ov-filter-cliente')?.value;
      const turno = document.getElementById('ov-filter-turno')?.value;
      const data = document.getElementById('ov-filter-data')?.value;

      filtrosAtivos = { linhaId };
      if (maquinaId) filtrosAtivos.maquinaLinhaId = maquinaId;
      if (cliente) filtrosAtivos.cliente = cliente;
      if (turno) filtrosAtivos.turnoInicio = turno;
      if (data) { filtrosAtivos.dataInicio = data; filtrosAtivos.dataFim = data; }

      await aplicarFiltros();
      filterPanel?.classList.add('hidden');
      const temFiltros = maquinaId || cliente || turno || data;
      filterBtn?.classList.toggle('active', !!temFiltros);
    };
  }

  // Limpar filtros
  const btnLimpar = document.getElementById('ov-filter-limpar');
  if (btnLimpar) {
    btnLimpar.onclick = () => {
      filtrosAtivos = {};
      ['ov-filter-maquina', 'ov-filter-cliente', 'ov-filter-turno', 'ov-filter-data']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      filterBtn?.classList.remove('active');
      filterPanel?.classList.add('hidden');
    };
  }

  inicializarFiltros();
  renderFluxoLinha();
  updateOverview();
}

export function updateOverview() {
  const m = store.measurement;
  if (!m.active && m.state !== 'finished') return;
  if (isShowingFiltered) return;

  const elapsed = store.getElapsedMs();
  const running = store.getRunningMs();
  const stopped = store.getStoppedMs();
  const stops = store.getStops();
  const speed = store.config.speed || 1;
  const displayProd = store.getDisplayProduction();
  const oeeProd = store.getProductionForOEE();

  document.getElementById('ov-elapsed').textContent = formatTime(elapsed);
  document.getElementById('ov-production').textContent = displayProd.toLocaleString('pt-BR');

  const availability = elapsed > 0 ? (running / elapsed) * 100 : 0;
  const runningHours = running / 3600000;
  const expectedOutput = runningHours * speed;
  const performance = expectedOutput > 0 ? (oeeProd / expectedOutput) * 100 : 0;
  const oee = (availability / 100) * (Math.min(performance, 100) / 100) * 100;

  document.getElementById('ov-efficiency').textContent = formatPercent(availability);
  document.getElementById('ov-oee').textContent = formatPercent(oee);

  const runPct = elapsed > 0 ? (running / elapsed) * 100 : 100;
  const stopPct = elapsed > 0 ? (stopped / elapsed) * 100 : 0;
  document.getElementById('ov-bar-running').style.width = `${runPct}%`;
  document.getElementById('ov-bar-stopped').style.width = `${stopPct}%`;
  document.getElementById('ov-running-time').textContent = formatTime(running);
  document.getElementById('ov-stopped-time').textContent = formatTime(stopped);

  document.getElementById('ov-total-stops').textContent = stops.length;

  if (stops.length > 0) {
    const mtbf = running / stops.length;
    const avgStopMs = stopped / stops.length;
    document.getElementById('ov-mtbf').textContent = formatTimeMM(mtbf);
    document.getElementById('ov-mttr').textContent = formatTimeMM(avgStopMs);
  } else {
    document.getElementById('ov-mtbf').textContent = '—';
    document.getElementById('ov-mttr').textContent = '—';
  }

  document.getElementById('ov-availability').textContent = formatPercent(availability);
  document.getElementById('ov-performance').textContent = formatPercent(Math.min(performance, 100));

  renderPieChart();
  renderProductionChart();
  renderFluxoLinha();
  renderMaquinasCards(ultimoStatus);
}

// ============================================================
// FILTROS
// ============================================================

async function inicializarFiltros() {
  const linhaId = store.config.linhaId;
  if (!linhaId) return;

  try {
    const [maquinas, filtros] = await Promise.all([
      api.listarMaquinas(linhaId),
      api.filtrosDisponiveis(linhaId),
    ]);

    maquinasLinha = maquinas;

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

    const selCliente = document.getElementById('ov-filter-cliente');
    if (selCliente) {
      selCliente.innerHTML = '<option value="">Todos</option>';
      filtros.clientes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        selCliente.appendChild(opt);
      });
    }

    const selTurno = document.getElementById('ov-filter-turno');
    if (selTurno) {
      selTurno.innerHTML = '<option value="">Todos</option>';
      filtros.turnos.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
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

  } catch { maquinasLinha = []; }
}

async function aplicarFiltros() {
  try {
    const medicoes = await api.listarMedicoes(filtrosAtivos);
    renderMedicoesHistoricas(medicoes);
    if (medicoes.length > 0) {
      const medicao = await api.getMedicao(medicoes[0].id);
      updateOverviewFromMedicao(medicao);
      isShowingFiltered = true;
    } else {
      // If no filters or no results, show last measurement
      const allMedicoes = await api.listarMedicoes({ linhaId: store.config.linhaId });
      if (allMedicoes.length > 0) {
        const medicao = await api.getMedicao(allMedicoes[0].id);
        updateOverviewFromMedicao(medicao);
        isShowingFiltered = true;
      } else {
        // Fallback to current store
        updateOverview();
        isShowingFiltered = false;
      }
    }
  } catch {
    const list = document.getElementById('ov-maquinas-cards-list');
    if (list) list.innerHTML = '<p class="empty-state-sm">Erro ao buscar medições</p>';
  }
}

function renderMedicoesHistoricas(medicoes) {
  const cards = document.getElementById('ov-maquinas-cards');
  const list = document.getElementById('ov-maquinas-cards-list');
  if (!cards || !list) return;

  if (medicoes.length === 0) {
    list.innerHTML = '<p class="empty-state-sm">Nenhuma medição encontrada com esses filtros</p>';
    return;
  }

  list.innerHTML = medicoes.map(m => {
    const duracao = m.timestamp_fim
      ? formatTime(new Date(m.timestamp_fim) - new Date(m.timestamp_inicio))
      : '—';
    const producao = m.producao_final !== null && m.producao_inicial !== null
      ? (m.producao_final - m.producao_inicial).toLocaleString('pt-BR')
      : '—';
    const data = new Date(m.timestamp_inicio).toLocaleDateString('pt-BR');
    const status = m.timestamp_fim ? 'Finalizada' : 'Ativa';
    const statusClass = m.timestamp_fim ? 'ultima_medicao' : 'rodando';

    return `
      <div class="maquina-card">
        <div class="maquina-card-header">
          <span class="maquina-card-nome">${m.maquina}</span>
          <span class="maquina-card-status ${statusClass}">${status}</span>
        </div>
        <div class="maquina-card-metricas">
          <div class="maquina-metrica">
            <span class="maquina-metrica-label">Cliente</span>
            <span class="maquina-metrica-value">${m.cliente}</span>
          </div>
          <div class="maquina-metrica">
            <span class="maquina-metrica-label">Data</span>
            <span class="maquina-metrica-value">${data}</span>
          </div>
          <div class="maquina-metrica">
            <span class="maquina-metrica-label">Turno</span>
            <span class="maquina-metrica-value">${m.turno_inicio} - ${m.turno_fim}</span>
          </div>
          <div class="maquina-metrica">
            <span class="maquina-metrica-label">Duração</span>
            <span class="maquina-metrica-value">${duracao}</span>
          </div>
          <div class="maquina-metrica">
            <span class="maquina-metrica-label">Produção</span>
            <span class="maquina-metrica-value">${producao}</span>
          </div>
          <div class="maquina-metrica">
            <span class="maquina-metrica-label">Velocidade nominal</span>
            <span class="maquina-metrica-value">${m.velocidade_nominal?.toLocaleString('pt-BR') || '—'} un/h</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// ATUALIZAR OVERVIEW COM DADOS DE MEDIÇÃO HISTÓRICA
// ============================================================

function updateOverviewFromMedicao(medicao) {
  const startTime = new Date(medicao.timestamp_inicio);
  const endTime = medicao.timestamp_fim ? new Date(medicao.timestamp_fim) : new Date();
  const elapsed = endTime - startTime;

  // Sort events by timestamp
  const events = medicao.eventos.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Calculate running and stopped times
  let runningMs = 0;
  let stoppedMs = 0;
  let currentState = 'running'; // assume starts running
  let lastTime = startTime;

  for (const event of events) {
    const eventTime = new Date(event.timestamp);
    if (currentState === 'running') {
      runningMs += eventTime - lastTime;
    } else {
      stoppedMs += eventTime - lastTime;
    }
    currentState = event.tipo === 'marcha' ? 'running' : 'stopped';
    lastTime = eventTime;
  }

  // Add remaining time
  if (currentState === 'running') {
    runningMs += endTime - lastTime;
  } else {
    stoppedMs += endTime - lastTime;
  }

  // Production readings
  const productionReadings = events.filter(e => e.tipo === 'producao').map(e => ({
    time: e.timestamp,
    value: e.producao_leitura
  }));
  if (productionReadings.length === 0) {
    productionReadings.push({ time: medicao.timestamp_inicio, value: medicao.producao_inicial });
  }
  const displayProd = productionReadings.length > 0 ? productionReadings[productionReadings.length - 1].value : 0;
  const oeeProd = displayProd - medicao.producao_inicial;

  // Stops
  const stops = [];
  for (let i = 0; i < events.length; i++) {
    if (events[i].tipo === 'parada') {
      const next = events.find((e, j) => j > i && (e.tipo === 'marcha' || e.tipo === 'start'));
      const start = new Date(events[i].timestamp);
      const end = next ? new Date(next.timestamp) : endTime;
      stops.push({
        reason: events[i].motivo || 'Não informado',
        category: 'Interna', // default
        start: events[i].timestamp,
        end: next ? next.timestamp : medicao.timestamp_fim,
        durationMs: end - start,
      });
    }
  }

  const availability = elapsed > 0 ? (runningMs / elapsed) * 100 : 0;
  const runningHours = runningMs / 3600000;
  const expectedOutput = runningHours * medicao.velocidade_nominal;
  const performance = expectedOutput > 0 ? (oeeProd / expectedOutput) * 100 : 0;
  const oee = (availability / 100) * (Math.min(performance, 100) / 100) * 100;

  // Update display
  document.getElementById('ov-elapsed').textContent = formatTime(elapsed);
  document.getElementById('ov-production').textContent = displayProd.toLocaleString('pt-BR');
  document.getElementById('ov-efficiency').textContent = formatPercent(availability);
  document.getElementById('ov-oee').textContent = formatPercent(oee);

  const runPct = elapsed > 0 ? (runningMs / elapsed) * 100 : 100;
  const stopPct = elapsed > 0 ? (stoppedMs / elapsed) * 100 : 0;
  document.getElementById('ov-bar-running').style.width = `${runPct}%`;
  document.getElementById('ov-bar-stopped').style.width = `${stopPct}%`;
  document.getElementById('ov-running-time').textContent = formatTime(runningMs);
  document.getElementById('ov-stopped-time').textContent = formatTime(stoppedMs);

  document.getElementById('ov-total-stops').textContent = stops.length;

  if (stops.length > 0) {
    const mtbf = runningMs / stops.length;
    const avgStopMs = stoppedMs / stops.length;
    document.getElementById('ov-mtbf').textContent = formatTimeMM(mtbf);
    document.getElementById('ov-mttr').textContent = formatTimeMM(avgStopMs);
  } else {
    document.getElementById('ov-mtbf').textContent = '—';
    document.getElementById('ov-mttr').textContent = '—';
  }

  document.getElementById('ov-availability').textContent = formatPercent(availability);
  document.getElementById('ov-performance').textContent = formatPercent(Math.min(performance, 100));

  // Update client, machine, shift
  document.getElementById('ov-client').textContent = medicao.cliente;
  document.getElementById('ov-machine').textContent = medicao.maquina;
  document.getElementById('ov-shift').textContent = `${medicao.turno_inicio} - ${medicao.turno_fim}`;

  // Update status badge
  const badge = document.getElementById('ov-status-badge');
  if (medicao.timestamp_fim) {
    badge.textContent = 'Finalizada';
    badge.className = 'badge';
  } else {
    badge.textContent = 'Ativa';
    badge.className = 'badge badge-green';
  }

  // For charts, we can update similarly, but for now, skip or adapt
  renderPieChartFromStops(stops);
  renderProductionChartFromData(productionReadings, startTime.getTime(), medicao.velocidade_nominal, medicao.producao_inicial);
}

// ============================================================
// FLUXO DA LINHA
// ============================================================

async function renderFluxoLinha() {
  const container = document.getElementById('ov-fluxo-linha');
  const wrapper = document.getElementById('ov-fluxo-section');
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
      const seta = i < status.length - 1
        ? `<span class="fluxo-seta ${estado}">→</span>`
        : '';
      return `
        <div class="fluxo-maquina">
          <div class="fluxo-maquina-box ${estado}">
            <span class="fluxo-maquina-dot ${estado}"></span>
            ${abrev}
          </div>
          <span class="fluxo-maquina-nome">${m.maquina_nome}</span>
          <span class="fluxo-maquina-eficiencia ${estado}">${efText}</span>
        </div>
        ${seta}
      `;
    }).join('');

    if (wrapper && !wrapper.dataset.clickAdded) {
      wrapper.dataset.clickAdded = 'true';
      wrapper.style.cursor = 'pointer';
      wrapper.addEventListener('click', () => {
        document.getElementById('ov-maquinas-cards')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

  } catch {
    container.innerHTML = '<p class="empty-state-sm">Erro ao carregar fluxo</p>';
  }
}

// ============================================================
// CARDS DETALHADOS DAS MÁQUINAS
// ============================================================

function renderMaquinasCards(statusList) {
  const section = document.getElementById('ov-maquinas-cards');
  const list = document.getElementById('ov-maquinas-cards-list');
  if (!section || !list) return;

  const statusLabel = {
    rodando: 'Rodando',
    parado: 'Parada',
    sem_informacao: 'Sem Informação',
    ultima_medicao: 'Última Medição',
  };

  list.innerHTML = statusList.map(m => {
    const label = statusLabel[m.estado] || '—';
    const eficiencia = m.eficiencia !== null ? `${m.eficiencia}%` : '—';
    const producao = m.producao !== null && m.producao !== undefined
      ? m.producao.toLocaleString('pt-BR') : '—';
    const velocidade = m.velocidade !== null && m.velocidade !== undefined
      ? `${m.velocidade.toLocaleString('pt-BR')} un/h` : '—';
    const tempoParado = m.tempo_parado_ms !== null && m.tempo_parado_ms !== undefined
      ? formatTimeMM(m.tempo_parado_ms) : '—';
    const mtbf = m.mtbf_ms !== null && m.mtbf_ms !== undefined
      ? formatTimeMM(m.mtbf_ms) : '—';
    const mttr = m.mttr_ms !== null && m.mttr_ms !== undefined
      ? formatTimeMM(m.mttr_ms) : '—';

    return `
      <div class="maquina-card">
        <div class="maquina-card-header">
          <span class="maquina-card-nome">${m.maquina_nome}</span>
          <span class="maquina-card-status ${m.estado}">${label}</span>
        </div>
        <div class="maquina-card-metricas">
          <div class="maquina-metrica">
            <span class="maquina-metrica-label">Produção no turno</span>
            <span class="maquina-metrica-value">${producao}</span>
          </div>
          <div class="maquina-metrica">
            <span class="maquina-metrica-label">Velocidade</span>
            <span class="maquina-metrica-value">${velocidade}</span>
          </div>
          <div class="maquina-metrica">
            <span class="maquina-metrica-label">Tempo parado</span>
            <span class="maquina-metrica-value">${tempoParado}</span>
          </div>
          <div class="maquina-metrica">
            <span class="maquina-metrica-label">Eficiência</span>
            <span class="maquina-metrica-value">${eficiencia}</span>
          </div>
          <div class="maquina-metrica">
            <span class="maquina-metrica-label">MTBF</span>
            <span class="maquina-metrica-value">${mtbf}</span>
          </div>
          <div class="maquina-metrica">
            <span class="maquina-metrica-label">MTTR</span>
            <span class="maquina-metrica-value">${mttr}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// GRÁFICO DE PIZZA (DONUT)
// ============================================================

function renderPieChart() {
  const canvas = document.getElementById('ov-pie-chart');
  const legend = document.getElementById('ov-pie-legend');
  const noStopsMsg = document.getElementById('ov-no-stops-msg');
  if (!canvas) return;

  const byCategory = store.getStopsByCategory();
  const entries = Object.entries(byCategory);

  if (entries.length === 0) {
    canvas.style.display = 'none';
    legend.innerHTML = '';
    noStopsMsg.classList.remove('hidden');
    return;
  }

  canvas.style.display = 'block';
  noStopsMsg.classList.add('hidden');

  const ctx = canvas.getContext('2d');
  const total = entries.reduce((s, [, v]) => s + v.totalMs, 0);
  const cx = 100, cy = 100, r = 80;

  ctx.clearRect(0, 0, 200, 200);

  let startAngle = -Math.PI / 2;
  entries.forEach(([cat, data], i) => {
    const sliceAngle = (data.totalMs / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = PIE_COLORS[i % PIE_COLORS.length];
    ctx.fill();
    startAngle += sliceAngle;
  });

  ctx.beginPath();
  ctx.arc(cx, cy, 45, 0, Math.PI * 2);
  const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim();
  ctx.fillStyle = bgColor || '#111827';
  ctx.fill();

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#f1f5f9';
  ctx.font = 'bold 20px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(entries.reduce((s, [, v]) => s + v.count, 0), cx, cy - 6);

  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-dim').trim() || '#64748b';
  ctx.fillText('paradas', cx, cy + 12);

  legend.innerHTML = entries.map(([cat, data], i) => {
    const pct = Math.round((data.totalMs / total) * 100);
    const mins = Math.floor(data.totalMs / 60000);
    return `<div class="pie-legend-item">
      <span class="pie-legend-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
      <span class="pie-legend-text">${cat}</span>
      <span class="pie-legend-value">${data.count}x — ${mins}min (${pct}%)</span>
    </div>`;
  }).join('');
}

function renderPieChartFromStops(stops) {
  const canvas = document.getElementById('ov-pie-chart');
  const legend = document.getElementById('ov-pie-legend');
  const noStopsMsg = document.getElementById('ov-no-stops-msg');
  if (!canvas) return;

  const byCategory = {};
  for (const s of stops) {
    const cat = 'Interna'; // default, since motivo is not category
    if (!byCategory[cat]) byCategory[cat] = { count: 0, totalMs: 0 };
    byCategory[cat].count++;
    byCategory[cat].totalMs += s.durationMs;
  }
  const entries = Object.entries(byCategory);

  if (entries.length === 0) {
    canvas.style.display = 'none';
    legend.innerHTML = '';
    noStopsMsg.classList.remove('hidden');
    return;
  }

  canvas.style.display = 'block';
  noStopsMsg.classList.add('hidden');

  const ctx = canvas.getContext('2d');
  const total = entries.reduce((s, [, v]) => s + v.totalMs, 0);
  const cx = 100, cy = 100, r = 80;

  ctx.clearRect(0, 0, 200, 200);

  let startAngle = -Math.PI / 2;
  entries.forEach(([cat, data], i) => {
    const sliceAngle = (data.totalMs / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = PIE_COLORS[i % PIE_COLORS.length];
    ctx.fill();
    startAngle += sliceAngle;
  });

  ctx.beginPath();
  ctx.arc(cx, cy, 45, 0, Math.PI * 2);
  const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim();
  ctx.fillStyle = bgColor || '#111827';
  ctx.fill();

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#f1f5f9';
  ctx.font = 'bold 20px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(entries.reduce((s, [, v]) => s + v.count, 0), cx, cy - 6);

  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-dim').trim() || '#64748b';
  ctx.fillText('paradas', cx, cy + 12);

  legend.innerHTML = entries.map(([cat, data], i) => {
    const pct = Math.round((data.totalMs / total) * 100);
    const mins = Math.floor(data.totalMs / 60000);
    return `<div class="pie-legend-item">
      <span class="pie-legend-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
      <span class="pie-legend-text">${cat}</span>
      <span class="pie-legend-value">${data.count}x — ${mins}min (${pct}%)</span>
    </div>`;
  }).join('');
}

// ============================================================
// GRÁFICO DE LINHA — Produção real vs nominal
// ============================================================

function renderProductionChart() {
  const m = store.measurement;
  const readings = m.productionReadings || [];
  if (readings.length === 0) return;

  renderProductionChartFromData(readings, new Date(m.startTime).getTime(), store.config.speed || 0, m.initialProduction || 0);
}

function renderProductionChartFromData(readings, startTime, speed, initialProduction) {
  const canvas = document.getElementById('ov-production-chart');
  if (!canvas) return;

  const realValues = readings.map(r => r.value - initialProduction);
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
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Real',
          data: realValues,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#3b82f6',
        },
        {
          label: 'Nominal',
          data: nominalValues,
          borderColor: '#22c55e',
          borderDash: [6, 3],
          backgroundColor: 'transparent',
          fill: false,
          tension: 0,
          pointRadius: 0,
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { size: 12 }, usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('pt-BR')} un`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { size: 11 } },
          grid: { color: 'rgba(148,163,184,0.08)' }
        },
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