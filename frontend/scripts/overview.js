// ============================================================
// OVERVIEW.JS — Tela de overview (visão geral da medição)
// Mostra KPIs, barra de tempo rodando/parado, gráfico de pizza
// por categoria de alarme, indicadores MTBF/MTTR e botão de export.
// ============================================================

import { store } from './store.js';
import { formatTime, formatTimeMM, formatPercent } from './utils.js';

// Cores do gráfico de pizza — uma cor por categoria
const PIE_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e', '#8b5cf6', '#ec4899'];

// Inicializa a tela de overview
export function initOverview() {
  const m = store.measurement;
  const noData = document.getElementById('ov-no-data');
  const content = document.getElementById('ov-content');
  const badge = document.getElementById('ov-status-badge');

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
      // Nome do arquivo: auditoria_NomeCliente_2026-03-25.json
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

  // Coleta dados calculados do store
  const elapsed = store.getElapsedMs();   // Tempo total de medição
  const running = store.getRunningMs();   // Tempo rodando
  const stopped = store.getStoppedMs();   // Tempo parado
  const stops = store.getStops();         // Lista de paradas
  const speed = store.config.speed || 1;  // Velocidade nominal da máquina
  const displayProd = store.getDisplayProduction(); // Valor exibido (último informado)
  const oeeProd = store.getProductionForOEE();      // Valor pra cálculo (última - inicial)

  // KPIs principais
  document.getElementById('ov-elapsed').textContent = formatTime(elapsed);
  document.getElementById('ov-production').textContent = displayProd.toLocaleString('pt-BR');

  // Disponibilidade = tempo rodando / tempo total (em %)
  const availability = elapsed > 0 ? (running / elapsed) * 100 : 0;

  // Performance = produção real do período / produção esperada (em %)
  // Usa oeeProd (subtração) pra calcular, não o valor exibido
  const runningHours = running / 3600000;
  const expectedOutput = runningHours * speed;
  const performance = expectedOutput > 0 ? (oeeProd / expectedOutput) * 100 : 0;

  // OEE = Disponibilidade × Performance × Qualidade
  // Qualidade assumida como 100% (não medimos refugo neste app)
  const oee = (availability / 100) * (Math.min(performance, 100) / 100) * 100;

  document.getElementById('ov-efficiency').textContent = formatPercent(availability);
  document.getElementById('ov-oee').textContent = formatPercent(oee);

  // Barra visual de tempo (verde = rodando, vermelho = parado)
  const runPct = elapsed > 0 ? (running / elapsed) * 100 : 100;
  const stopPct = elapsed > 0 ? (stopped / elapsed) * 100 : 0;
  document.getElementById('ov-bar-running').style.width = `${runPct}%`;
  document.getElementById('ov-bar-stopped').style.width = `${stopPct}%`;
  document.getElementById('ov-running-time').textContent = formatTime(running);
  document.getElementById('ov-stopped-time').textContent = formatTime(stopped);

  // Indicadores
  document.getElementById('ov-total-stops').textContent = stops.length;

  if (stops.length > 0) {
    // MTBF = Tempo médio entre falhas (tempo rodando / número de paradas)
    const mtbf = running / stops.length;
    // MTTR = Tempo médio de reparo (tempo parado / número de paradas)
    const avgStopMs = stopped / stops.length;
    document.getElementById('ov-mtbf').textContent = formatTimeMM(mtbf);
    document.getElementById('ov-mttr').textContent = formatTimeMM(avgStopMs);
  } else {
    document.getElementById('ov-mtbf').textContent = '—';
    document.getElementById('ov-mttr').textContent = '—';
  }

  document.getElementById('ov-availability').textContent = formatPercent(availability);
  document.getElementById('ov-performance').textContent = formatPercent(Math.min(performance, 100));

  // Gráfico de pizza (paradas por categoria)
  renderPieChart();
}

// ============================================================
// GRÁFICO DE PIZZA (DONUT) — Paradas por categoria
// Desenha diretamente no canvas usando Canvas API
// ============================================================

function renderPieChart() {
  const canvas = document.getElementById('ov-pie-chart');
  const legend = document.getElementById('ov-pie-legend');
  const noStopsMsg = document.getElementById('ov-no-stops-msg');
  if (!canvas) return;

  const byCategory = store.getStopsByCategory();
  const entries = Object.entries(byCategory);

  // Se não tem paradas, esconde o gráfico
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
  const cx = 100, cy = 100, r = 80; // Centro e raio do gráfico

  ctx.clearRect(0, 0, 200, 200);

  // Desenha as fatias do pizza a partir do topo (-90°)
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

  // Furo central (transforma pizza em donut)
  ctx.beginPath();
  ctx.arc(cx, cy, 45, 0, Math.PI * 2);
  // Pega cor de fundo do tema atual pra preencher o furo
  const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim();
  ctx.fillStyle = bgColor || '#111827';
  ctx.fill();

  // Número total de paradas no centro do donut
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#f1f5f9';
  ctx.font = 'bold 20px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(entries.reduce((s, [, v]) => s + v.count, 0), cx, cy - 6);

  // Label "paradas" abaixo do número
  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-dim').trim() || '#64748b';
  ctx.fillText('paradas', cx, cy + 12);

  // Legenda ao lado do gráfico
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
