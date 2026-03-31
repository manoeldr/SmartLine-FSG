// ============================================================
// MAIN.JS — Ponto de entrada do aplicativo
// Gerencia navegação entre páginas, carregamento dinâmico
// de HTML e inicialização dos módulos de cada tela.
// Também roda o tick global (1x por segundo) pra atualizar timers.
// ============================================================

import { initOverview, updateOverview } from './overview.js';
import { initMedicao, updateMedicao, cleanupMedicao } from './medicao.js';
import { initParadas } from './paradas.js';
import { initConfig } from './config.js';
import { store } from './store.js';

// Referências ao DOM
const container = document.getElementById('page-container');
const navButtons = document.querySelectorAll('.nav-btn');
let currentPage = null; // Página ativa no momento

console.log('main.js carregado', new Date().toISOString());

// Carrega uma página dinamicamente via fetch do HTML
// e inicializa o módulo JS correspondente
async function loadPage(name) {
  console.log('loadPage chamado:', name, 'currentPage:', currentPage, new Error().stack);
  // Evita recarregar a mesma página
  if (currentPage === name) return;

  // Limpa recursos da página anterior (se necessário)
  if (currentPage === 'medicao') cleanupMedicao();

  currentPage = name;

  // Atualiza visual dos botões da navbar (destaca o ativo)
  navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.page === name));

  try {
    // Carrega o HTML da página com cache desativado (vital para o Live Server)
    const resp = await fetch(`pages/${name}.html`, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} - Falha ao carregar página`);

    const html = await resp.text();

    // Guard: se outra navegação ocorreu enquanto o fetch estava pendente, ignora
    if (currentPage !== name) return;

    container.innerHTML = html;

    // Chama a função de inicialização da página carregada
    switch (name) {
      case 'overview': initOverview(); break;
      case 'medicao': initMedicao(); break;
      case 'paradas': initParadas(); break;
      case 'config': initConfig(); break;
    }
  } catch (e) {
    if (currentPage !== name) return;
    console.error('Erro ao carregar página:', e);
    container.innerHTML = `<div class="empty-state"><p>Erro ao carregar página</p></div>`;
  }
}

// Configura os botões da navbar pra navegar entre páginas
navButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    console.log('Nav clicado:', btn.dataset.page, 'target:', e.target, 'currentTarget:', e.currentTarget);
    loadPage(btn.dataset.page);
  });
});

// Tick global: roda a cada 1 segundo pra atualizar timers,
// verificar fim de turno e solicitar produção
setInterval(() => {
  if (currentPage === 'overview') updateOverview();
  if (currentPage === 'medicao') updateMedicao();
}, 1000);

// Inicialização do app
store.init();       // Carrega dados do localStorage
store.applyTheme(); // Aplica tema (dark/light) antes de renderizar
loadPage('overview'); // Abre na página de overview por padrão