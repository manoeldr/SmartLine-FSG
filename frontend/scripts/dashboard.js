// ============================================================
// DASHBOARD.JS — Tela de visão geral da linha de produção
// Mostra dados agregados: produção e estado da máquina crítica,
// eficiência média, paradas, MTBF/MTTR e fluxo visual em tempo real.
// ============================================================

import { store } from './store.js';
import { api } from './api.js';
import { formatTimeMM, formatPercent } from './utils.js';

// Inicializa a tela do dashboard. Verifica se a linha está configurada
// e carrega os dados iniciais.
export function initDashboard() {
  const linhaId = store.config.linhaId;
  const noConfig = document.getElementById('db-no-config');
  const content = document.getElementById('db-content');

  if (!linhaId) {
    noConfig?.classList.remove('hidden');
    content?.classList.add('hidden');
    return;
  }

  noConfig?.classList.add('hidden');
  content?.classList.remove('hidden');

  document.getElementById('db-client').textContent = store.config.client || '—';

  configurarCliqueFluxo();
  updateDashboard();
}

// Atualiza todos os dados do dashboard. Chamada pelo tick global a cada segundo.
export async function updateDashboard() {
  const linhaId = store.config.linhaId;
  if (!linhaId) return;

  try {
    const [dashboard, status] = await Promise.all([
      api.dashboardLinha(linhaId),
      api.statusLinha(linhaId),
    ]);

    atualizarKPIs(dashboard, status);
    renderFluxo(status);
  } catch {
    // falha silenciosa — próximo tick tentará novamente
  }
}

// Atualiza os KPIs e indicadores com os dados do backend.
function atualizarKPIs(dashboard, status) {
  // Máquinas ativas
  const ativasEl = document.getElementById('db-maquinas-ativas');
  if (ativasEl) ativasEl.textContent = `${dashboard.maquinas_ativas} / ${dashboard.maquinas_total}`;

  // Produção da máquina crítica
  const producaoEl = document.getElementById('db-producao');
  if (producaoEl) {
    producaoEl.textContent = dashboard.producao_critica !== null
      ? dashboard.producao_critica.toLocaleString('pt-BR')
      : '—';
  }

  // Eficiência média da linha
  const eficienciaEl = document.getElementById('db-eficiencia');
  if (eficienciaEl) {
    eficienciaEl.textContent = dashboard.eficiencia_media !== null
      ? `${dashboard.eficiencia_media}%`
      : '—';
  }

  // Total de paradas
  const paradasEl = document.getElementById('db-paradas');
  if (paradasEl) paradasEl.textContent = dashboard.total_paradas ?? '—';

  // Velocidade da máquina crítica
  const velocidadeEl = document.getElementById('db-velocidade');
  if (velocidadeEl) {
    velocidadeEl.textContent = dashboard.velocidade_critica !== null
      ? dashboard.velocidade_critica.toLocaleString('pt-BR')
      : '—';
  }

  // Nome da máquina crítica
  const criticaEl = document.getElementById('db-maquina-critica');
  if (criticaEl) {
    const critica = status.find(m => m.critica);
    criticaEl.textContent = critica ? critica.maquina_nome : 'Não definida';
  }

  // Estado da máquina crítica
  const estadoCriticaEl = document.getElementById('db-estado-critica');
  if (estadoCriticaEl) {
    const labels = {
      rodando: 'Rodando',
      parado: 'Parada',
      sem_informacao: 'Sem informação',
      ultima_medicao: 'Última medição',
    };
    estadoCriticaEl.textContent = labels[dashboard.estado_critica] || '—';
    estadoCriticaEl.style.color = dashboard.estado_critica === 'rodando'
      ? 'var(--green)'
      : dashboard.estado_critica === 'parado'
      ? 'var(--red)'
      : 'var(--text-dim)';
  }

  // MTBF e MTTR médios
  const mtbfEl = document.getElementById('db-mtbf');
  if (mtbfEl) mtbfEl.textContent = dashboard.mtbf_medio_ms ? formatTimeMM(dashboard.mtbf_medio_ms) : '—';

  const mttrEl = document.getElementById('db-mttr');
  if (mttrEl) mttrEl.textContent = dashboard.mttr_medio_ms ? formatTimeMM(dashboard.mttr_medio_ms) : '—';

  // Badge de status no header
  const badge = document.getElementById('db-status-badge');
  if (badge) {
    if (dashboard.maquinas_ativas === 0) {
      badge.textContent = 'Sem medições'; badge.className = 'badge';
    } else if (dashboard.estado_critica === 'rodando') {
      badge.textContent = 'Rodando'; badge.className = 'badge badge-green';
    } else if (dashboard.estado_critica === 'parado') {
      badge.textContent = 'Parado'; badge.className = 'badge badge-red';
    } else {
      badge.textContent = `${dashboard.maquinas_ativas} ativas`; badge.className = 'badge';
    }
  }
}

// Renderiza o fluxo visual das máquinas no dashboard.
function renderFluxo(status) {
  const container = document.getElementById('db-fluxo-linha');
  if (!container) return;

  if (status.length === 0) {
    container.innerHTML = '<p class="empty-state-sm">Nenhuma máquina cadastrada</p>';
    return;
  }

  container.innerHTML = status.map((m, i) => {
    const abrev = m.maquina_nome.substring(0, 4).toUpperCase();
    const estado = m.estado;
    const efText = m.eficiencia !== null ? `${m.eficiencia}%` : '—';
    const criticaIndicator = m.critica
      ? '<span style="position:absolute;top:4px;left:6px;color:var(--brand);font-size:0.6rem;">★</span>'
      : '';
    const seta = i < status.length - 1
      ? `<span class="fluxo-seta ${estado}">→</span>`
      : '';
    return `
      <div class="fluxo-maquina">
        <div class="fluxo-maquina-box ${estado}">
          ${criticaIndicator}
          <span class="fluxo-maquina-dot ${estado}"></span>
          ${abrev}
        </div>
        <span class="fluxo-maquina-nome">${m.maquina_nome}</span>
        <span class="fluxo-maquina-eficiencia ${estado}">${efText}</span>
      </div>
      ${seta}
    `;
  }).join('');
}

// Configura o clique no fluxo para exibir os cards detalhados de cada máquina.
function configurarCliqueFluxo() {
  const wrapper = document.getElementById('db-fluxo-section');
  if (!wrapper || wrapper.dataset.clickAdded) return;
  wrapper.dataset.clickAdded = 'true';
  wrapper.style.cursor = 'pointer';
  wrapper.addEventListener('click', async () => {
    const linhaId = store.config.linhaId;
    if (!linhaId) return;
    try {
      const status = await api.statusLinha(linhaId);
      renderMaquinasCards(status);
      document.getElementById('db-maquinas-cards')?.scrollIntoView({ behavior: 'smooth' });
    } catch { /* silencioso */ }
  });
}

// Renderiza os cards detalhados de cada máquina da linha.
function renderMaquinasCards(statusList) {
  const section = document.getElementById('db-maquinas-cards');
  const list = document.getElementById('db-maquinas-cards-list');
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
      ? m.producao.toLocaleString('pt-BR') : '—';
    const velocidade = m.velocidade !== null && m.velocidade !== undefined
      ? `${m.velocidade.toLocaleString('pt-BR')} un/h` : '—';
    const tempoParado = m.tempo_parado_ms !== null && m.tempo_parado_ms !== undefined
      ? formatTimeMM(m.tempo_parado_ms) : '—';
    const mtbf = m.mtbf_ms !== null && m.mtbf_ms !== undefined
      ? formatTimeMM(m.mtbf_ms) : '—';
    const mttr = m.mttr_ms !== null && m.mttr_ms !== undefined
      ? formatTimeMM(m.mttr_ms) : '—';
    const criticaBadge = m.critica
      ? '<span style="font-size:0.7rem;color:var(--brand);margin-left:6px;">★ crítica</span>'
      : '';

    return `
      <div class="maquina-card">
        <div class="maquina-card-header">
          <span class="maquina-card-nome">${m.maquina_nome}${criticaBadge}</span>
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