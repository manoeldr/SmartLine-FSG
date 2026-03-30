// ============================================================
// CONFIG.JS — Tela de configuração
// Gerencia formulário de cliente/máquina/turno, lista de alarmes
// com categorias, intervalo de produção, tema e reset.
// ============================================================

import { store } from './store.js';

// Inicializa a tela de configuração preenchendo os campos com dados salvos
export function initConfig() {
  const cfg = store.config;

  // Preenche campos do formulário
  const elClient = document.getElementById('cfg-client');
  if (elClient) elClient.value = cfg.client || '';
  const elMachine = document.getElementById('cfg-machine');
  if (elMachine) elMachine.value = cfg.machine || '';
  const elSpeed = document.getElementById('cfg-speed');
  if (elSpeed) elSpeed.value = cfg.speed || '';
  const elShiftStart = document.getElementById('cfg-shift-start');
  if (elShiftStart) elShiftStart.value = cfg.shiftStart || '08:00';
  const elShiftEnd = document.getElementById('cfg-shift-end');
  if (elShiftEnd) elShiftEnd.value = cfg.shiftEnd || '17:00';
  const elProdInterval = document.getElementById('cfg-prod-interval');
  if (elProdInterval) elProdInterval.value = cfg.productionInterval || 30;

  // Popula dropdown de categorias de alarme
  const catSelect = document.getElementById('cfg-new-alarm-cat');
  if (catSelect) {
    catSelect.innerHTML = (cfg.alarmCategories || ['Interna', 'Externa']).map(c =>
      `<option value="${c}">${c}</option>`
    ).join('');
  }

  // ============================================================
  // TOGGLE DE TEMA (claro/escuro)
  // ============================================================

  const themeToggle = document.getElementById('cfg-theme-toggle');
  const themeLabel = document.getElementById('cfg-theme-label');
  const currentTheme = store.getTheme();

  if (themeToggle && themeLabel) {
    // Sincroniza visual do toggle com o tema salvo
    if (currentTheme === 'light') {
      themeToggle.classList.add('active');
      themeLabel.textContent = 'Claro';
    } else {
      themeToggle.classList.remove('active');
      themeLabel.textContent = 'Escuro';
    }

    // Ao clicar, alterna entre dark e light
    themeToggle.addEventListener('click', () => {
      const isLight = themeToggle.classList.contains('active');
      const newTheme = isLight ? 'dark' : 'light';
      store.setTheme(newTheme); // Salva e aplica imediatamente no DOM
      themeToggle.classList.toggle('active');
      themeLabel.textContent = newTheme === 'light' ? 'Claro' : 'Escuro';
    });
  }

  // ============================================================
  // LISTA DE ALARMES
  // ============================================================

  renderAlarms();

  // Adicionar novo alarme com categoria selecionada
  const btnAddAlarm = document.getElementById('cfg-add-alarm');
  if (btnAddAlarm) {
    btnAddAlarm.addEventListener('click', () => {
      const nameInput = document.getElementById('cfg-new-alarm');
      const catSelect = document.getElementById('cfg-new-alarm-cat');
      if (nameInput && nameInput.value.trim()) {
        store.addAlarm(nameInput.value.trim(), catSelect ? catSelect.value : 'Interna');
        nameInput.value = '';
        renderAlarms();
      }
    });
  }

  // Enter no campo de alarme dispara o botão +
  const inputNewAlarm = document.getElementById('cfg-new-alarm');
  if (inputNewAlarm) {
    inputNewAlarm.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const btnAdd = document.getElementById('cfg-add-alarm');
        if (btnAdd) btnAdd.click();
      }
    });
  }

  // ============================================================
  // SALVAR CONFIGURAÇÃO
  // ============================================================

  const btnSave = document.getElementById('cfg-save-btn');
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const client = document.getElementById('cfg-client')?.value.trim();
      const machine = document.getElementById('cfg-machine')?.value.trim();
      const speed = parseInt(document.getElementById('cfg-speed')?.value) || 0;
      const shiftStart = document.getElementById('cfg-shift-start')?.value;
      const shiftEnd = document.getElementById('cfg-shift-end')?.value;
      const productionInterval = parseInt(document.getElementById('cfg-prod-interval')?.value) || 30;

      store.updateConfig({
        client, machine, speed, shiftStart, shiftEnd, productionInterval
      });
      showToast('Configuração salva');
    });
  }

  // ============================================================
  // RESETAR MEDIÇÃO (zona de perigo)
  // ============================================================

  const resetBtn = document.getElementById('cfg-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Tem certeza? Todos os dados da medição atual serão apagados.')) {
        store.resetMeasurement();
        showToast('Medição resetada');
      }
    });
  }
}

// Renderiza a lista de alarmes agrupados por categoria
// Cada alarme tem um botão × pra remover
function renderAlarms() {
  const list = document.getElementById('cfg-alarm-list');
  if (!list) return;
  const alarms = store.config.alarms || [];

  // Agrupa por categoria mantendo o índice original (necessário pro delete)
  const grouped = {};
  alarms.forEach((a, i) => {
    const cat = a.category || 'Interna';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ ...a, originalIndex: i });
  });

  // Gera HTML com label de categoria e itens com botão de remover
  let html = '';
  for (const [cat, items] of Object.entries(grouped)) {
    html += `<div class="alarm-category-label">${cat}</div>`;
    for (const item of items) {
      html += `<div class="alarm-item">
        <span>${item.name}</span>
        <button class="remove-alarm" data-index="${item.originalIndex}">&times;</button>
      </div>`;
    }
  }
  list.innerHTML = html;

  // Listener nos botões de remover
  list.querySelectorAll('.remove-alarm').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Evita propagar o clique pro item
      store.removeAlarm(parseInt(btn.dataset.index));
      renderAlarms(); // Re-renderiza a lista
    });
  });
}

// Mostra um toast temporário no topo da tela (feedback visual)
function showToast(message) {
  // Remove toast anterior se existir
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;padding:10px 24px;border-radius:8px;font-size:0.875rem;font-weight:600;z-index:300;animation:fadeIn 0.2s ease;`;
  document.body.appendChild(toast);

  // Remove automaticamente após 2 segundos
  setTimeout(() => toast.remove(), 2000);
}
