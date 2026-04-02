// ============================================================
// OVERVIEW.JS — Tela de overview (visão geral da medição)
// ============================================================

import { store } from './store.js';
import { api } from './api.js';
import { formatTime, formatTimeMM, formatPercent } from './utils.js';

const PIE_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e', '#8b5cf6', '#ec4899'];
let productionChart = null;
let ultimoStatus = [];

export function initOverview() {
  const m = store.measurement;
  const noData = document.getElementById('ov-no-data');
  const content = document.getElementById('ov-content');
  const badge = document.getElementById('ov-status-badge');

  productionChart = null;
  ultimoStatus = [];

  if (!m.active && m.state !== 'finished') {
    noData.classList.remove('hidden');
    content.classList.add('hidden');
    badge.textContent = 'Aguardando';
    badge.className = 'badge';
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

  renderFluxoLinha();
  updateOverview();
}

export function updateOverview() {
  const m = store.measurement;
  if (!m.active && m.state !== 'finished') return;

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

    // Configura clique para scroll aos cards — apenas uma vez
    if (wrapper && !wrapper.dataset.clickAdded) {
      wrapper.dataset.clickAdded = 'true';
      wrapper.style.cursor = 'pointer';
      wrapper.addEventListener('click', () => {
        renderMaquinasCards(ultimoStatus);
        document.getElementById('ov-maquinas-cards')?.scrollIntoView({ behavior: 'smooth' });
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

  section.classList.remove('hidden');

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
      ? m.producao.toLocaleString('pt-BR')
      : '—';
    const velocidade = m.velocidade !== null && m.velocidade !== undefined
      ? `${m.velocidade.toLocaleString('pt-BR')} un/h`
      : '—';
    const tempoParado = m.tempo_parado_ms !== null && m.tempo_parado_ms !== undefined
      ? formatTimeMM(m.tempo_parado_ms)
      : '—';
    const mtbf = m.mtbf_ms !== null && m.mtbf_ms !== undefined
      ? formatTimeMM(m.mtbf_ms)
      : '—';
    const mttr = m.mttr_ms !== null && m.mttr_ms !== undefined
      ? formatTimeMM(m.mttr_ms)
      : '—';

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

// ============================================================
// GRÁFICO DE LINHA — Produção real vs nominal
// ============================================================

function renderProductionChart() {
  const canvas = document.getElementById('ov-production-chart');
  if (!canvas) return;

  const m = store.measurement;
  const readings = m.productionReadings || [];
  if (readings.length === 0) return;

  const speed = store.config.speed || 0;
  const startTime = new Date(m.startTime).getTime();

  const realValues = readings.map(r => r.value - (m.initialProduction || 0));
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