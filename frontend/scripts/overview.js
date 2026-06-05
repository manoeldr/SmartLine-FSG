// ============================================================
// OVERVIEW.JS — Tela de visão geral da linha de produção
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
let linhaAtualId = null;

const FLUXO_UPDATE_INTERVAL_MS = 30_000;

// ============================================================
// INICIALIZAÇÃO
// ============================================================

export async function initOverview() {
  productionChart = null;
  modalPieChart = null;
  ultimoStatus = [];
  filtrosAtivos = {};
  lastFluxoUpdateTime = 0;
  linhaAtualId = store.config.linhaId || null;

  if (!linhaAtualId) linhaAtualId = await detectarLinhaAtiva();

  iniciarClock();
  await inicializarFiltros();
  configurarFiltroUI();
  await renderFluxoLinha();
  await carregarDadosCritica();
  lastFluxoUpdateTime = Date.now();
}

async function detectarLinhaAtiva() {
  try {
    const medicoes = await api.listarMedicoes({});
    const ativa = medicoes.find(m => !m.timestamp_fim && m.linha_id);
    if (ativa?.linha_id) return ativa.linha_id;
    const clientes = await api.listarClientes();
    if (clientes.length > 0) {
      const linhas = await api.listarLinhas(clientes[0].id);
      if (linhas.length > 0) return linhas[0].id;
    }
  } catch { /* silencioso */ }
  return null;
}

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

function iniciarClock() { atualizarClock(); }

function atualizarClock() {
  const el = document.getElementById('ov-clock');
  if (el) el.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// FILTROS
// ============================================================

async function inicializarFiltros() {
  const linhaId = linhaAtualId;
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
        opt.value = m.id; opt.textContent = m.nome;
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

function configurarFiltroUI() {
  const filterBtn = document.getElementById('ov-filter-btn');
  const filterPanel = document.getElementById('ov-filter-panel');

  filterBtn?.addEventListener('click', () => {
    filterPanel?.classList.toggle('hidden');
    filterBtn.classList.toggle('active');
  });

  document.getElementById('ov-filter-aplicar')?.addEventListener('click', async () => {
    const maquinaId = document.getElementById('ov-filter-maquina')?.value;
    const turno = document.getElementById('ov-filter-turno')?.value;
    const data = document.getElementById('ov-filter-data')?.value;
    filtrosAtivos = { linhaId: linhaAtualId };
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

async function carregarDadosCritica() {
  const linhaId = linhaAtualId;
  if (!linhaId) {
    document.getElementById('ov-no-data')?.classList.remove('hidden');
    document.getElementById('ov-content')?.classList.add('hidden');
    return;
  }

  document.getElementById('ov-no-data')?.classList.add('hidden');
  document.getElementById('ov-content')?.classList.remove('hidden');

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
        linhaId, maquinaLinhaId: critica.maquina_id, ...filtrosAtivos,
      });
      if (medicoes.length > 0) {
        const indicadores = await api.indicadoresMedicao(medicoes[0].id);
        exibirIndicadores(indicadores);
        renderBarChart(medicoes[0]);
      }
    } else {
      limparIndicadores();
    }
  } catch (e) {
    console.warn('[overview] Erro ao carregar dados:', e);
  }
}

function exibirIndicadores(ind) {
  document.getElementById('ov-total-stops').textContent = ind.num_paradas ?? '—';
  document.getElementById('ov-mtbf').textContent = ind.mtbf_ms ? formatTimeMM(ind.mtbf_ms) : '—';
  document.getElementById('ov-mttr').textContent = ind.mttr_ms ? formatTimeMM(ind.mttr_ms) : '—';
  document.getElementById('ov-availability').textContent = formatPercent(ind.disponibilidade ?? 0);
  document.getElementById('ov-performance').textContent = formatPercent(ind.performance ?? 0);
  document.getElementById('ov-oee').textContent = formatPercent(ind.oee ?? 0);
}

function limparKPIs() {
  ['ov-vel-nominal', 'ov-production', 'ov-efficiency', 'ov-total-stops'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '—';
  });
  limparIndicadores();
}

function limparIndicadores() {
  ['ov-mtbf', 'ov-mttr', 'ov-availability', 'ov-performance', 'ov-oee'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '—';
  });
}

// ============================================================
// GRÁFICO DE BARRAS — PRODUÇÃO
// ============================================================

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
        { label: 'Real', data: realValues, backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 4 },
        { label: 'Nominal', data: nominalValues, type: 'line', borderColor: '#22c55e', borderDash: [6, 3], backgroundColor: 'transparent', fill: false, tension: 0, pointRadius: 0, borderWidth: 2 }
      ]
    },
    options: {
      responsive: true, animation: false,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 12 }, usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y?.toLocaleString('pt-BR')} un` } }
      },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(148,163,184,0.08)' } },
        y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(148,163,184,0.08)' }, beginAtZero: true, title: { display: true, text: 'unidades', color: '#64748b', font: { size: 11 } } }
      }
    }
  });
}

// ============================================================
// FLUXO DA LINHA
// ============================================================

async function renderFluxoLinha() {
  const container = document.getElementById('ov-fluxo-linha');
  if (!container) return;

  if (!linhaAtualId) {
    container.innerHTML = '<p class="empty-state-sm">Nenhuma linha disponível</p>';
    return;
  }

  try {
    const status = await api.statusLinha(linhaAtualId);
    ultimoStatus = status;

    if (status.length === 0) {
      container.innerHTML = '<p class="empty-state-sm">Nenhuma máquina cadastrada</p>';
      return;
    }

    container.innerHTML = status.map((m, i) => {
      const abrev = m.maquina_nome.substring(0, 3).toUpperCase();
      const estado = m.estado;
      const efText = m.eficiencia !== null ? `${m.eficiencia}%` : '—';

      const criticaStar = m.critica
        ? '<span style="position:absolute;top:3px;left:5px;color:var(--brand);font-size:0.6rem;font-weight:700;">★</span>'
        : '';

      const badgeSemiAuto = m.tipo === 'semiautomatico'
        ? '<span style="position:absolute;bottom:3px;right:4px;font-size:0.45rem;font-weight:700;color:var(--brand);letter-spacing:0.3px;line-height:1;">IOT</span>'
        : '';

      const seta = i < status.length - 1 ? `<span class="fluxo-seta ${estado}">→</span>` : '';

      return `
        <div class="fluxo-maquina" data-maquina-id="${m.maquina_id}">
          <div class="fluxo-maquina-box ${estado}">
            ${criticaStar}${badgeSemiAuto}
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

// medicaoAtiva é salva aqui para uso no modal de edição de categoria
let _medicaoAtualModal = null;

async function abrirModalMaquina(maquina) {
  const modal = document.getElementById('modal-maquina-detalhes');
  if (!modal) return;

  _medicaoAtualModal = null;

  const dot = document.getElementById('modal-maq-dot');
  if (dot) dot.className = `status-dot-inline ${maquina.estado}`;
  document.getElementById('modal-maq-nome').textContent = maquina.maquina_nome;

  const statusLabels = {
    rodando: 'Rodando', parado: 'Parada',
    sem_informacao: 'Sem informação', ultima_medicao: 'Última medição',
  };
  document.getElementById('modal-maq-sub').textContent = statusLabels[maquina.estado] || '—';
  document.getElementById('modal-maq-producao').textContent = maquina.producao !== null && maquina.producao !== undefined
    ? maquina.producao.toLocaleString('pt-BR') : '0';
  document.getElementById('modal-maq-eficiencia').textContent = maquina.eficiencia !== null ? `${maquina.eficiencia}%` : '0%';
  document.getElementById('modal-maq-tempo-parado').textContent = maquina.tempo_parado_ms ? formatTimeMM(maquina.tempo_parado_ms) : '00:00';
  document.getElementById('modal-maq-mtbf').textContent = maquina.mtbf_ms ? formatTimeMM(maquina.mtbf_ms) : '00:00';
  document.getElementById('modal-maq-mttr').textContent = maquina.mttr_ms ? formatTimeMM(maquina.mttr_ms) : '00:00';
  document.getElementById('modal-maq-oee').textContent = '—';

  if (modalPieChart) { modalPieChart.destroy(); modalPieChart = null; }
  document.getElementById('modal-maq-eventos').innerHTML = '';
  const legendElement = document.getElementById('modal-maq-pie-legend');
  if (legendElement) legendElement.innerHTML = '';
  const timeElement = document.getElementById('modal-donut-time');
  if (timeElement) timeElement.textContent = '00:00';
  const pctElement = document.getElementById('modal-donut-pct');
  if (pctElement) pctElement.textContent = '0 paradas';
  document.getElementById('modal-maq-no-eventos')?.classList.remove('hidden');
  document.getElementById('modal-maq-no-stops')?.classList.remove('hidden');
  document.getElementById('modal-donut-inner')?.classList.add('hidden');

  modal.onclick = (e) => { if (e.target === modal) fecharModal(); };

  const btnFechar = document.getElementById('modal-maq-fechar');
  const novoBtn = btnFechar.cloneNode(true);
  btnFechar.parentNode.replaceChild(novoBtn, btnFechar);
  novoBtn.addEventListener('click', fecharModal);

  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');

  try {
    const medicoes = await api.listarMedicoes({
      linhaId: linhaAtualId, maquinaLinhaId: maquina.maquina_id,
    });

    if (medicoes.length > 0) {
      const medicao = medicoes[0];
      _medicaoAtualModal = medicao;

      const subEl = document.getElementById('modal-maq-sub');
      if (subEl) {
        const dataRef = medicao.timestamp_fim || medicao.timestamp_inicio;
        const dataStr = new Date(dataRef).toLocaleDateString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });
        if (maquina.estado === 'rodando' || maquina.estado === 'parado') {
          const auditor = medicao.usuario_nome || '—';
          const tipoStr = medicao.tipo === 'semiautomatico' ? ' · Semi Auto' : '';
          subEl.textContent = `Medindo: ${auditor}${tipoStr} · desde ${dataStr}`;
        } else {
          subEl.textContent = `${statusLabels[maquina.estado] || '—'} · ${dataStr}`;
        }
      }

      const ind = await api.indicadoresMedicao(medicao.id);
      document.getElementById('modal-maq-oee').textContent = formatPercent(ind.oee ?? 0);
      renderModalDonutFromIndicadores(ind, medicao);
      renderModalEventos(medicao.eventos || [], medicao);
    }
  } catch (e) {
    console.warn('[modal] Erro ao carregar detalhes:', e);
  }
}

function fecharModal() {
  document.getElementById('modal-maquina-detalhes')?.classList.add('hidden');
  document.body.classList.remove('modal-open');
  if (modalPieChart) { modalPieChart.destroy(); modalPieChart = null; }
  _medicaoAtualModal = null;
}

function renderModalDonutFromIndicadores(ind, medicao) {
  const canvas = document.getElementById('modal-maq-pie');
  const legend = document.getElementById('modal-maq-pie-legend');
  const noStops = document.getElementById('modal-maq-no-stops');
  const inner = document.getElementById('modal-donut-inner');
  if (!canvas) return;

  if (modalPieChart) { modalPieChart.destroy(); modalPieChart = null; }

  const paradas = ind.paradas_por_motivo || [];

  if (paradas.length === 0) {
    inner?.classList.add('hidden');
    noStops?.classList.remove('hidden');
    return;
  }

  inner?.classList.remove('hidden');
  noStops?.classList.add('hidden');

  document.getElementById('modal-donut-time').textContent = formatTimeMM(ind.stopped_ms ?? 0);
  document.getElementById('modal-donut-pct').textContent = `${ind.num_paradas} paradas`;

  modalPieChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: paradas.map(p => p.motivo),
      datasets: [{ data: paradas.map(p => p.total_ms), backgroundColor: PIE_COLORS, borderWidth: 0, hoverOffset: 4 }]
    },
    options: {
      responsive: false, animation: false, cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => { const mins = Math.floor(ctx.parsed / 60000); return `${ctx.label}: ${mins}min (${paradas[ctx.dataIndex].percentual}%)`; } } }
      }
    }
  });

  legend.innerHTML = paradas.map((p, i) => {
    const mins = Math.floor(p.total_ms / 60000);
    const secs = Math.floor((p.total_ms % 60000) / 1000);
    const tempoStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const catColor = p.categoria === 'Externa' ? 'var(--amber)' : 'var(--red)';
    const catLabel = p.categoria || 'Interna';
    return `
      <div class="modal-donut-legend-item">
        <div class="modal-donut-legend-row">
          <span class="modal-donut-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
          <span class="modal-donut-legend-nome">${p.motivo}</span>
          <span style="font-size:0.6rem;font-weight:600;color:${catColor};margin-left:4px;">${catLabel}</span>
        </div>
        <span class="modal-donut-legend-detalhe">${tempoStr} · ${p.percentual}%</span>
      </div>
    `;
  }).join('');
}

// ============================================================
// TIMELINE DE EVENTOS DO MODAL
// Eventos de parada têm botão para editar categoria (Interna/Externa).
// Apenas admin e auditor podem editar (cliente-level não vê o botão).
// ============================================================

function renderModalEventos(eventos, medicao) {
  const container = document.getElementById('modal-maq-eventos');
  const noEventos = document.getElementById('modal-maq-no-eventos');
  if (!container) return;

  const eventoInicio = {
    tipo: 'inicio', timestamp: medicao.timestamp_inicio,
    motivo: null, producao_leitura: medicao.producao_inicial ?? null, foto_path: null,
  };
  const eventosFim = medicao.timestamp_fim ? [{
    tipo: 'fim', timestamp: medicao.timestamp_fim,
    motivo: null, producao_leitura: medicao.producao_final ?? null, foto_path: null,
  }] : [];

  const todosEventos = [eventoInicio, ...eventos, ...eventosFim];
  const relevantes = [...todosEventos]
    .filter(e => ['parada', 'marcha', 'producao', 'inicio', 'fim', 'pausa', 'retomada'].includes(e.tipo))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (relevantes.length === 0) {
    container.innerHTML = '';
    noEventos?.classList.remove('hidden');
    return;
  }

  noEventos?.classList.add('hidden');

  const todosCronologicos = [...relevantes].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const agora = new Date();

  const iconePorTipo = {
    inicio: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    fim: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`,
    parada: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`,
    marcha: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    producao: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    pausa: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
    retomada: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  };

  const labelPorTipo = {
    inicio: 'Início da medição', fim: 'Medição finalizada',
    parada: 'Parada', marcha: 'Rodando', producao: 'Produção',
    pausa: 'Pausa programada', retomada: 'Retomada',
  };

  const corPorTipo = {
    inicio: 'marcha', fim: 'parada', parada: 'parada',
    marcha: 'marcha', producao: 'producao', pausa: 'pausa', retomada: 'pausa',
  };

  // Apenas admin e auditor podem editar categoria
  const nivelUsuario = window.usuarioAtual?.nivel;
  const podeEditarCategoria = nivelUsuario === 'admin' || nivelUsuario === 'auditor';

  container.innerHTML = relevantes.map(ev => {
    const hora = new Date(ev.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const icone = iconePorTipo[ev.tipo] || '';
    const label = labelPorTipo[ev.tipo] || ev.tipo;
    const cor = corPorTipo[ev.tipo] || ev.tipo;

    let motivo = '';
    if (ev.tipo === 'parada') motivo = ev.motivo || 'Sem informação';
    if (ev.tipo === 'marcha') motivo = 'Retomada da produção';
    if (ev.tipo === 'producao') motivo = `${ev.producao_leitura?.toLocaleString('pt-BR') || '—'} un`;
    if (ev.tipo === 'inicio') motivo = ev.producao_leitura !== null ? `Produção inicial: ${ev.producao_leitura?.toLocaleString('pt-BR')} un` : '';
    if (ev.tipo === 'fim') motivo = ev.producao_leitura !== null ? `Produção final: ${ev.producao_leitura?.toLocaleString('pt-BR')} un` : '';
    if (ev.tipo === 'pausa') motivo = ev.motivo || 'Pausa programada';
    if (ev.tipo === 'retomada') motivo = 'Retomada após pausa';

    let duracao = '';
    const idxCron = todosCronologicos.findIndex(e => e.timestamp === ev.timestamp && e.tipo === ev.tipo);
    if (idxCron !== -1 && ev.tipo !== 'fim') {
      const proximo = todosCronologicos[idxCron + 1];
      const fim = proximo ? new Date(proximo.timestamp) : agora;
      const durationMs = fim - new Date(ev.timestamp);
      if (durationMs > 0 && ev.tipo !== 'producao') {
        const mins = Math.floor(durationMs / 60000);
        const secs = Math.floor((durationMs % 60000) / 1000);
        duracao = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    }

    // Badge de categoria para paradas — cor diferente por tipo
    let categoriaBadge = '';
    if (ev.tipo === 'parada') {
      const cat = ev.categoria || 'Interna';
      const catColor = cat === 'Externa' ? 'var(--amber)' : 'var(--red)';
      categoriaBadge = `<span class="evento-categoria-badge" data-evento-id="${ev.id}" data-medicao-id="${medicao.id}" data-categoria="${cat}"
        style="font-size:0.6rem;font-weight:700;color:${catColor};background:${cat === 'Externa' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)'};padding:2px 6px;border-radius:8px;border:1px solid ${catColor};cursor:${podeEditarCategoria ? 'pointer' : 'default'};">
        ${cat}
      </span>`;
    }

    return `
      <div class="evento-item">
        <span class="evento-hora">${hora}</span>
        <div class="evento-icone ${cor}">${icone}</div>
        <div class="evento-body">
          <div class="evento-tipo" style="display:flex;align-items:center;gap:6px;">
            ${label}
            ${categoriaBadge}
          </div>
          ${motivo ? `<div class="evento-motivo">${motivo}</div>` : ''}
        </div>
        <div class="evento-right" style="margin-left:auto;display:flex;align-items:flex-start;gap:14px;">
          ${ev.foto_path ? `
            <button type="button" class="btn-evento-foto"
              data-foto="${api.fotoEventoUrl(ev.medicao_id, ev.id)}"
              style="background:none;border:none;padding:4px 0 0 0;cursor:pointer;" title="Ver foto">
              <img src="icons/modals/photo.svg" width="24" height="24" alt="Foto">
            </button>` : ''}
          ${duracao ? `<span class="evento-duracao" style="margin-left:0;">${duracao}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Listener para editar categoria ao clicar no badge
  if (podeEditarCategoria) {
    container.querySelectorAll('.evento-categoria-badge').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const eventoId = parseInt(badge.dataset.eventoId);
        const medicaoId = parseInt(badge.dataset.medicaoId);
        const categoriaAtual = badge.dataset.categoria;
        abrirModalEditarCategoria(eventoId, medicaoId, categoriaAtual, badge, medicao.eventos);
      });
    });
  }

  container.querySelectorAll('.btn-evento-foto').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirModalFoto(btn.getAttribute('data-foto'));
    });
  });
}

// ============================================================
// MODAL: EDITAR CATEGORIA DA PARADA
// Mini modal inline com duas opções: Interna / Externa
// ============================================================

function abrirModalEditarCategoria(eventoId, medicaoId, categoriaAtual, badgeEl, eventos) {
  // Remove modal anterior se existir
  document.getElementById('modal-editar-categoria')?.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-editar-categoria';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:320px;">
      <h3>Categoria da parada</h3>
      <p class="modal-sub">Classifique esta parada para o cálculo correto do OEE</p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
        <button type="button" class="btn-cat-opcao ${categoriaAtual === 'Interna' ? 'ativa' : ''}"
          data-cat="Interna"
          style="padding:14px;border-radius:var(--radius-sm);border:2px solid ${categoriaAtual === 'Interna' ? 'var(--red)' : 'var(--border)'};background:${categoriaAtual === 'Interna' ? 'rgba(239,68,68,0.08)' : 'var(--bg)'};cursor:pointer;text-align:left;">
          <div style="font-size:0.875rem;font-weight:700;color:var(--red);">Interna</div>
          <div style="font-size:0.75rem;color:var(--text-dim);margin-top:2px;">Falha de equipamento, setup, ajuste — penaliza o OEE</div>
        </button>
        <button type="button" class="btn-cat-opcao ${categoriaAtual === 'Externa' ? 'ativa' : ''}"
          data-cat="Externa"
          style="padding:14px;border-radius:var(--radius-sm);border:2px solid ${categoriaAtual === 'Externa' ? 'var(--amber)' : 'var(--border)'};background:${categoriaAtual === 'Externa' ? 'rgba(245,158,11,0.08)' : 'var(--bg)'};cursor:pointer;text-align:left;">
          <div style="font-size:0.875rem;font-weight:700;color:var(--amber);">Externa</div>
          <div style="font-size:0.75rem;color:var(--text-dim);margin-top:2px;">Falta de material, aguardando operador — não penaliza o OEE</div>
        </button>
      </div>
      <button type="button" class="btn btn-outline btn-block" id="btn-cancelar-categoria">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll('.btn-cat-opcao').forEach(btn => {
    btn.addEventListener('click', async () => {
      const novaCategoria = btn.dataset.cat;
      if (novaCategoria === categoriaAtual) { modal.remove(); return; }

      try {
        await api.atualizarCategoriaEvento(medicaoId, eventoId, novaCategoria);

        // Atualiza o badge visualmente sem recarregar tudo
        const catColor = novaCategoria === 'Externa' ? 'var(--amber)' : 'var(--red)';
        badgeEl.textContent = novaCategoria;
        badgeEl.dataset.categoria = novaCategoria;
        badgeEl.style.color = catColor;
        badgeEl.style.background = novaCategoria === 'Externa' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';
        badgeEl.style.borderColor = catColor;

        modal.remove();
      } catch (e) {
        console.warn('[overview] Erro ao atualizar categoria:', e);
        modal.remove();
      }
    });
  });

  document.getElementById('btn-cancelar-categoria').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ============================================================
// MODAL: VISUALIZADOR DE FOTO
// ============================================================

function abrirModalFoto(url) {
  const modal = document.getElementById('modal-image-viewer');
  const img = document.getElementById('image-viewer-img');
  if (!modal || !img) return;
  img.src = url;
  modal.classList.remove('hidden');
  const closeBtn = document.getElementById('modal-image-fechar');
  if (closeBtn) closeBtn.onclick = fecharModalFoto;
  modal.onclick = (e) => { if (e.target === modal) fecharModalFoto(); };
}

function fecharModalFoto() {
  const modal = document.getElementById('modal-image-viewer');
  const img = document.getElementById('image-viewer-img');
  if (modal) modal.classList.add('hidden');
  if (img) img.src = '';
}