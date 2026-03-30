// ============================================================
// OVERVIEW.JS — Tela de overview (visão geral da medição)
// Mostra KPIs, barra de tempo rodando/parado, gráfico de pizza
// por categoria de alarme, indicadores MTBF/MTTR, gráfico de
// produção real vs nominal e botão de export.
// ============================================================

import { store } from './store.js';
import { formatTime, formatTimeMM, formatPercent } from './utils.js';

// Cores do gráfico de pizza — uma cor por categoria
const PIE_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e', '#8b5cf6', '#ec4899'];

// Instância do gráfico de produção (Chart.js)
let productionChart = null;

// Inicializa a tela de overview
export function initOverview() {
  const m = store.measurement;
  const noData = document.getElementById('ov-no-data');
  const content = document.getElementById('ov-content');
  const badge = document.getElementById('ov-status-badge');

  // Reseta o chart ao recarregar a página
  productionChart = null;

  // Se não tem medição (nem ativa nem finalizada), mostra estado vazio
  if (!m.active && m.state !== 'finished') {
    noData.classList.remove('hidden');
    content.classList.add('hidden');
    badge.textContent = 'Aguardando';
    badge.className = 'badge';
    return;
  }

  noData.classList.add('hidden');
  content.classList.remove('hidden');

  // Badge de status no header
  if (m.state === 'running') {
    badge.textContent = 'Rodando'; badge.className = 'badge badge-green';
  } else if (m.state === 'stopped') {
    badge.textContent = 'Parado'; badge.className = 'badge badge-red';
  } else if (m.state === 'finished') {
    badge.textContent = 'Finalizada'; badge.className = 'badge';
  }

  // Preenche barra de informações (cliente, máquina, turno)
  document.getElementById('ov-client').textContent = store.config.client || '—';
  document.getElementById('ov-machine').textContent = store.config.machine || '—';
  document.getElementById('ov-shift').textContent = `${store.config.shiftStart} - ${store.config.shiftEnd}`;

  // Botão de exportar JSON
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

  updateOverview();
}

// Atualiza todos os dados da tela (chamada a cada 1 segundo pelo main.js)
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

  // KPIs principais
  document.getElementById('ov-elapsed').textContent = formatTime(elapsed);
  document.getElementById('ov-production').textContent = displayProd.toLocaleString('pt-BR');

  // Disponibilidade
  const availability = elapsed > 0 ? (running / elapsed) * 100 : 0;

  // Performance
  const runningHours = running / 3600000;
  const expectedOutput = runningHours * speed;
  const performance = expectedOutput > 0 ? (oeeProd / expectedOutput) * 100 : 0;

  // OEE
  const oee = (availability / 100) * (Math.min(performance, 100) / 100) * 100;

  document.getElementById('ov-efficiency').textContent = formatPercent(availability);
  document.getElementById('ov-oee').textContent = formatPercent(oee);

  // Barra de tempo
  const runPct = elapsed > 0 ? (running / elapsed) * 100 : 100;
  const stopPct = elapsed > 0 ? (stopped / elapsed) * 100 : 0;
  document.getElementById('ov-bar-running').style.width = `${runPct}%`;
  document.getElementById('ov-bar-stopped').style.width = `${stopPct}%`;
  document.getElementById('ov-running-time').textContent = formatTime(running);
  document.getElementById('ov-stopped-time').textContent = formatTime(stopped);

  // Indicadores
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

  // Gráficos
  renderPieChart();
  renderProductionChart();
}

// ============================================================
// GRÁFICO DE PIZZA (DONUT) — Paradas por categoria
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
// GRÁFICO DE LINHA — Produção real vs nominal (Chart.js)
// ============================================================

function renderProductionChart() {
  const canvas = document.getElementById('ov-production-chart');
  if (!canvas) return;

  const m = store.measurement;
  const readings = m.productionReadings || [];
  if (readings.length === 0) return;

  const speed = store.config.speed || 0;
  const startTime = new Date(m.startTime).getTime();

  // Dados reais — subtrai produção inicial pra mostrar só o que foi produzido na medição
  const realValues = readings.map(r => r.value - (m.initialProduction || 0));

  // Linha nominal — produção esperada no mesmo intervalo de tempo
  const nominalValues = readings.map(r => {
    const elapsedMin = (new Date(r.time).getTime() - startTime) / 60000;
    return Math.round((speed / 60) * elapsedMin);
  });

  // Labels do eixo X em minutos
  const labels = readings.map(r => {
    const min = Math.round((new Date(r.time).getTime() - startTime) / 60000);
    return `${min}min`;
  });

  // Se o chart já existe, apenas atualiza os dados
  if (productionChart) {
    productionChart.data.labels = labels;
    productionChart.data.datasets[0].data = realValues;
    productionChart.data.datasets[1].data = nominalValues;
    productionChart.update('none'); // 'none' desativa animação na atualização
    return;
  }

  // Cria o chart pela primeira vez
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
          labels: {
            color: '#94a3b8',
            font: { size: 12 },
            usePointStyle: true,
          }
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
          title: {
            display: true,
            text: 'unidades',
            color: '#64748b',
            font: { size: 11 }
          }
        }
      }
    }
  });
}