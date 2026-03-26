// ============================================================
// PARADAS.JS — Tela de paradas
// Mostra lista de todas as paradas com filtros por categoria,
// gráfico de barras por motivo e por categoria, e cards detalhados.
// ============================================================

import { store } from './store.js';
import { formatTimeMM, formatTimeHHMM } from './utils.js';

// Cores fixas por categoria de alarme
const CAT_COLORS = { 'Interna': '#ef4444', 'Externa': '#f59e0b' };

// Cores para as barras do gráfico por motivo (cíclicas)
const REASON_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#22c55e', '#e11d48'];

// Filtro ativo no momento ('all' ou nome da categoria)
let activeFilter = 'all';

// Inicializa a tela de paradas
export function initParadas() {
  const allStops = store.getStops();
  const noData = document.getElementById('par-no-data');
  const content = document.getElementById('par-content');
  const badge = document.getElementById('par-count-badge');

  badge.textContent = allStops.length;

  // Se não tem paradas, mostra estado vazio
  if (allStops.length === 0) {
    noData.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  noData.classList.add('hidden');
  content.classList.remove('hidden');

  activeFilter = 'all';
  buildFilters(allStops);  // Monta os chips de filtro
  renderAll();              // Renderiza tudo
}

// Monta os chips de filtro baseado nas categorias encontradas nas paradas
function buildFilters(stops) {
  const container = document.getElementById('par-filters');
  // Extrai categorias únicas das paradas existentes
  const categories = [...new Set(stops.map(s => s.category))];

  // Chip "Todas" + um chip por categoria
  let html = '<button class="filter-chip active" data-filter="all">Todas</button>';
  for (const cat of categories) {
    const color = CAT_COLORS[cat] || '#6b7280';
    html += `<button class="filter-chip" data-filter="${cat}">
      <span class="filter-dot" style="background:${color}"></span>${cat}
    </button>`;
  }
  container.innerHTML = html;

  // Listener: ao clicar num chip, ativa o filtro e re-renderiza
  container.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      renderAll();
    });
  });
}

// Retorna paradas filtradas pela categoria ativa
function getFilteredStops() {
  const all = store.getStops();
  if (activeFilter === 'all') return all;
  return all.filter(s => s.category === activeFilter);
}

// Renderiza todas as seções da tela (KPIs, gráficos, lista)
function renderAll() {
  const stops = getFilteredStops();
  renderSummary(stops);
  renderBarChartByReason(stops);
  renderBarChartByCategory();
  renderList(stops);
}

// ============================================================
// KPIs DE RESUMO (topo da tela)
// ============================================================

function renderSummary(stops) {
  const totalMs = stops.reduce((sum, s) => sum + s.durationMs, 0);
  const avgMs = stops.length > 0 ? totalMs / stops.length : 0;

  document.getElementById('par-total-stops').textContent = stops.length;
  document.getElementById('par-total-time').textContent = formatTimeMM(totalMs);
  document.getElementById('par-avg-time').textContent = formatTimeMM(avgMs);
}

// ============================================================
// GRÁFICO DE BARRAS: TEMPO POR MOTIVO
// Barras horizontais ordenadas do maior tempo pro menor.
// Cada barra mostra: nome do alarme, badge da categoria,
// barra proporcional e contagem + tempo.
// ============================================================

function renderBarChartByReason(stops) {
  const chart = document.getElementById('par-bar-chart');

  // Agrupa paradas por motivo e soma duração
  const grouped = {};
  for (const s of stops) {
    if (!grouped[s.reason]) grouped[s.reason] = { totalMs: 0, count: 0, category: s.category };
    grouped[s.reason].totalMs += s.durationMs;
    grouped[s.reason].count++;
  }

  // Ordena do maior tempo pro menor
  const entries = Object.entries(grouped).sort((a, b) => b[1].totalMs - a[1].totalMs);
  const maxMs = entries.length > 0 ? entries[0][1].totalMs : 1;

  if (entries.length === 0) {
    chart.innerHTML = '<div class="empty-state-sm">Sem dados para o filtro selecionado</div>';
    return;
  }

  // Gera HTML das barras
  chart.innerHTML = entries.map(([reason, data], i) => {
    const pct = Math.max(5, (data.totalMs / maxMs) * 100); // Mínimo 5% pra ficar visível
    const mins = Math.floor(data.totalMs / 60000);
    const secs = Math.floor((data.totalMs % 60000) / 1000);
    const color = REASON_COLORS[i % REASON_COLORS.length];
    const catColor = CAT_COLORS[data.category] || '#6b7280';
    return `<div class="bar-row">
      <div class="bar-label">
        <span class="bar-reason">${reason}</span>
        <span class="bar-cat-badge" style="background:${catColor}20;color:${catColor}">${data.category}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="bar-value">${data.count}x — ${mins}m${secs > 0 ? secs + 's' : ''}</div>
    </div>`;
  }).join('');
}

// ============================================================
// GRÁFICO DE BARRAS: TEMPO POR CATEGORIA
// Visão alto nível: Interna vs Externa (sempre mostra TODAS,
// independente do filtro, pra dar contexto comparativo)
// ============================================================

function renderBarChartByCategory() {
  const chart = document.getElementById('par-cat-chart');
  const byCategory = store.getStopsByCategory(); // Sempre usa todas as paradas
  const entries = Object.entries(byCategory);

  if (entries.length === 0) {
    chart.innerHTML = '<div class="empty-state-sm">Sem dados</div>';
    return;
  }

  const maxMs = Math.max(...entries.map(([, d]) => d.totalMs), 1);

  chart.innerHTML = entries.map(([cat, data]) => {
    const pct = Math.max(5, (data.totalMs / maxMs) * 100);
    const mins = Math.floor(data.totalMs / 60000);
    const secs = Math.floor((data.totalMs % 60000) / 1000);
    const color = CAT_COLORS[cat] || '#6b7280';
    return `<div class="bar-row">
      <div class="bar-label">
        <span class="bar-reason">${cat}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="bar-value">${data.count}x — ${mins}m${secs > 0 ? secs + 's' : ''}</div>
    </div>`;
  }).join('');
}

// ============================================================
// LISTA DE PARADAS (cards individuais)
// Cada card mostra: motivo, duração, badge de categoria,
// horário de início e fim. Borda esquerda colorida por categoria.
// ============================================================

function renderList(stops) {
  const list = document.getElementById('par-list');

  if (stops.length === 0) {
    list.innerHTML = '<div class="empty-state-sm">Sem paradas para o filtro selecionado</div>';
    return;
  }

  list.innerHTML = stops.map((s, i) => {
    const catColor = CAT_COLORS[s.category] || '#6b7280';
    return `<div class="par-card" style="border-left-color:${catColor}">
      <div class="par-card-header">
        <span class="par-card-reason">${s.reason}</span>
        <span class="par-card-duration">${formatTimeMM(s.durationMs)}</span>
      </div>
      <div class="par-card-meta">
        <span class="par-card-cat" style="background:${catColor}20;color:${catColor}">${s.category}</span>
        <span class="par-card-time">Início: ${formatTimeHHMM(s.start)}</span>
        <span class="par-card-time">Fim: ${s.end ? formatTimeHHMM(s.end) : 'Em andamento'}</span>
      </div>
    </div>`;
  }).join('');
}
