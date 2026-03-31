// ============================================================
// CONFIG.JS — Tela de configuração
// Seções: Cliente, Linha, Fluxo da linha, Minha máquina,
// Configuração da medição (turno, velocidade, alarmes)
// ============================================================

import { store } from './store.js';
import { api } from './api.js';

let estadoConfig = {
  clienteId: null,
  linhaId: null,
  maquinaId: null,
  maquinas: [],
};

export function initConfig() {
  setTimeout(() => {
    configurarSelectCliente();
    configurarSelectLinha();
    configurarBotaoAdicionarCliente();
    configurarBotaoAdicionarLinha();
    configurarBotaoAdicionarMaquina();
    configurarBotaoSalvar();
    configurarBotaoReset();
    configurarTema();
    configurarAlarmes();
    preencherConfigMedicao();
    carregarClientes();
  }, 50);
}

// ============================================================
// SEÇÃO 1 — CLIENTE
// ============================================================

async function carregarClientes() {
  const select = document.getElementById('cfg-cliente-select');
  const loading = document.getElementById('cfg-cliente-loading');

  loading.classList.remove('hidden');
  select.disabled = true;

  try {
    const clientes = await api.listarClientes();
    select.innerHTML = '<option value="">Selecione um cliente...</option>';
    clientes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nome;
      select.appendChild(opt);
    });

    const saved = store.config.clienteId;
    if (saved) {
      select.value = saved;
      estadoConfig.clienteId = saved;
      await carregarLinhas(saved);
    }
  } catch {
    showToast('Erro ao carregar clientes', 'erro');
  } finally {
    loading.classList.add('hidden');
    select.disabled = false;
  }
}

function configurarSelectCliente() {
  const select = document.getElementById('cfg-cliente-select');
  if (!select || select.dataset.listenerAdded) return;
  select.dataset.listenerAdded = 'true';
  select.addEventListener('change', async () => {
    estadoConfig.clienteId = select.value || null;
    estadoConfig.linhaId = null;
    estadoConfig.maquinaId = null;
    // Limpa IDs salvos no store para não restaurar linha/máquina do cliente anterior
    store.updateConfig({ linhaId: null, maquinaId: null });
    limparLinhas();
    limparMaquinas();
    if (estadoConfig.clienteId) await carregarLinhas(estadoConfig.clienteId);
  });
}

function configurarBotaoAdicionarCliente() {
  const btn = document.getElementById('cfg-cliente-add-btn');
  if (!btn) return;
  const novo = btn.cloneNode(true);
  btn.parentNode.replaceChild(novo, btn);
  novo.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const input = document.getElementById('cfg-cliente-novo');
    const nome = input.value.trim();
    if (!nome) return;
    try {
      const criado = await api.criarCliente(nome);
      const select = document.getElementById('cfg-cliente-select');
      const opt = document.createElement('option');
      opt.value = criado.id;
      opt.textContent = criado.nome;
      select.appendChild(opt);
      select.value = criado.id;
      select.dispatchEvent(new Event('change'));
      input.value = '';
      showToast('Cliente cadastrado');
    } catch (err) {
      showToast(err.message || 'Erro ao cadastrar cliente', 'erro');
    }
  });
}

// ============================================================
// SEÇÃO 2 — LINHA
// ============================================================

async function carregarLinhas(clienteId) {
  const select = document.getElementById('cfg-linha-select');
  const section = document.getElementById('cfg-linha-section');

  section.classList.remove('hidden');
  select.innerHTML = '<option value="">Selecione uma linha...</option>';

  try {
    const linhas = await api.listarLinhas(clienteId);
    linhas.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.nome;
      select.appendChild(opt);
    });

    const saved = store.config.linhaId;
    if (saved) {
      select.value = saved;
      estadoConfig.linhaId = saved;
      await carregarMaquinas(saved);
    }
  } catch {
    showToast('Erro ao carregar linhas', 'erro');
  }
}

function configurarSelectLinha() {
  const select = document.getElementById('cfg-linha-select');
  if (!select || select.dataset.listenerAdded) return;
  select.dataset.listenerAdded = 'true';
  select.addEventListener('change', async () => {
    estadoConfig.linhaId = select.value || null;
    estadoConfig.maquinaId = null;
    limparMaquinas();
    if (estadoConfig.linhaId) await carregarMaquinas(estadoConfig.linhaId);
  });
}

function configurarBotaoAdicionarLinha() {
  const btn = document.getElementById('cfg-linha-add-btn');
  if (!btn) return;
  const novo = btn.cloneNode(true);
  btn.parentNode.replaceChild(novo, btn);
  novo.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const input = document.getElementById('cfg-linha-nova');
    const nome = input.value.trim();
    if (!nome || !estadoConfig.clienteId) return;
    try {
      const criada = await api.criarLinha(nome, estadoConfig.clienteId);
      const select = document.getElementById('cfg-linha-select');
      const opt = document.createElement('option');
      opt.value = criada.id;
      opt.textContent = criada.nome;
      select.appendChild(opt);
      select.value = criada.id;
      select.dispatchEvent(new Event('change'));
      input.value = '';
      showToast('Linha cadastrada');
    } catch (err) {
      showToast(err.message || 'Erro ao cadastrar linha', 'erro');
    }
  });
}

function limparLinhas() {
  const select = document.getElementById('cfg-linha-select');
  const section = document.getElementById('cfg-linha-section');
  select.innerHTML = '<option value="">Selecione uma linha...</option>';
  section.classList.add('hidden');
  limparMaquinas();
}

// ============================================================
// SEÇÃO 3 — FLUXO DA LINHA (máquinas)
// ============================================================

async function carregarMaquinas(linhaId) {
  const section = document.getElementById('cfg-maquinas-section');
  section.classList.remove('hidden');

  try {
    estadoConfig.maquinas = await api.listarMaquinas(linhaId);
  } catch {
    estadoConfig.maquinas = [];
  }

  renderMaquinas();
  renderSelectMinhaMaquina();
}

function configurarBotaoAdicionarMaquina() {
  const btn = document.getElementById('cfg-maquina-add-btn');
  if (!btn) return;
  const novo = btn.cloneNode(true);
  btn.parentNode.replaceChild(novo, btn);
  novo.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const input = document.getElementById('cfg-maquina-nova');
    const nome = input.value.trim();
    if (!nome || !estadoConfig.linhaId) return;
    const ordem = estadoConfig.maquinas.length + 1;
    try {
      const criada = await api.criarMaquina(estadoConfig.linhaId, nome, ordem);
      estadoConfig.maquinas.push(criada);
      renderMaquinas();
      renderSelectMinhaMaquina();
      input.value = '';
      showToast('Máquina adicionada');
    } catch (err) {
      showToast(err.message || 'Erro ao adicionar máquina', 'erro');
    }
  });
}

function renderMaquinas() {
  const list = document.getElementById('cfg-maquinas-list');
  if (estadoConfig.maquinas.length === 0) {
    list.innerHTML = '<p class="empty-hint">Nenhuma máquina cadastrada ainda</p>';
    return;
  }

  list.innerHTML = estadoConfig.maquinas.map((m) => `
    <div class="maquina-item" draggable="true" data-id="${m.id}">
      <span class="drag-handle">⠿</span>
      <span class="maquina-ordem">${m.ordem}</span>
      <span class="maquina-nome">${m.nome}</span>
      <button type="button" class="btn-icon remove-maquina" data-id="${m.id}">×</button>
    </div>
  `).join('');

  // Listeners de remoção
  list.querySelectorAll('.remove-maquina').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      try {
        await api.deletarMaquina(estadoConfig.linhaId, id);
        estadoConfig.maquinas = estadoConfig.maquinas.filter(m => m.id !== id);
        renderMaquinas();
        renderSelectMinhaMaquina();
        showToast('Máquina removida');
      } catch {
        showToast('Erro ao remover máquina', 'erro');
      }
    });
  });

  // Drag and drop
  let dragging = null;

  list.querySelectorAll('.maquina-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragging = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', async (e) => {
      e.stopPropagation();
      item.classList.remove('dragging');
      dragging = null;

      const items = [...list.querySelectorAll('.maquina-item')];
      const novaOrdem = items.map((el, i) => ({
        id: parseInt(el.dataset.id),
        ordem: i + 1,
      }));

      // Atualiza localmente
      novaOrdem.forEach(({ id, ordem }) => {
        const m = estadoConfig.maquinas.find(m => m.id === id);
        if (m) m.ordem = ordem;
      });
      estadoConfig.maquinas.sort((a, b) => a.ordem - b.ordem);

      // Salva no backend
      try {
        await Promise.all(
          novaOrdem.map(({ id, ordem }) =>
            api.atualizarMaquina(estadoConfig.linhaId, id, { ordem })
          )
        );
        renderMaquinas();
        renderSelectMinhaMaquina();
        showToast('Ordem salva');
      } catch (err) {
        console.error('Erro ao salvar ordem:', err);
        showToast('Erro ao salvar nova ordem', 'erro');
      }
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dragging && dragging !== item) {
        const rect = item.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) {
          list.insertBefore(dragging, item);
        } else {
          list.insertBefore(dragging, item.nextSibling);
        }
      }
    });
  });
}

function renderSelectMinhaMaquina() {
  const select = document.getElementById('cfg-minha-maquina-select');
  const section = document.getElementById('cfg-minha-maquina-section');

  if (estadoConfig.maquinas.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  select.innerHTML = '<option value="">Selecione sua máquina...</option>';
  estadoConfig.maquinas.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.ordem}. ${m.nome}`;
    select.appendChild(opt);
  });

  const saved = store.config.maquinaId;
  if (saved) select.value = saved;

  select.onchange = () => {
    estadoConfig.maquinaId = select.value || null;
  };
}

function limparMaquinas() {
  estadoConfig.maquinas = [];
  estadoConfig.maquinaId = null;

  const section = document.getElementById('cfg-maquinas-section');
  const minhaMaquinaSection = document.getElementById('cfg-minha-maquina-section');
  const list = document.getElementById('cfg-maquinas-list');

  section.classList.add('hidden');
  minhaMaquinaSection.classList.add('hidden');

  if (list) list.innerHTML = '';
}

// ============================================================
// SEÇÃO 4 — CONFIGURAÇÃO DA MEDIÇÃO
// ============================================================

function preencherConfigMedicao() {
  const cfg = store.config;
  document.getElementById('cfg-speed').value = cfg.speed || '';
  document.getElementById('cfg-shift-start').value = cfg.shiftStart || '08:00';
  document.getElementById('cfg-shift-end').value = cfg.shiftEnd || '17:00';
  document.getElementById('cfg-prod-interval').value = cfg.productionInterval || 30;
}

function configurarBotaoSalvar() {
  const btn = document.getElementById('cfg-save-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const maquinaSelecionada = estadoConfig.maquinas.find(
      m => m.id === parseInt(document.getElementById('cfg-minha-maquina-select').value)
    );

    store.updateConfig({
      clienteId: estadoConfig.clienteId,
      linhaId: estadoConfig.linhaId,
      maquinaId: estadoConfig.maquinaId,
      client: document.getElementById('cfg-cliente-select').selectedOptions[0]?.text || '',
      machine: maquinaSelecionada?.nome || '',
      speed: parseInt(document.getElementById('cfg-speed').value) || 0,
      shiftStart: document.getElementById('cfg-shift-start').value,
      shiftEnd: document.getElementById('cfg-shift-end').value,
      productionInterval: parseInt(document.getElementById('cfg-prod-interval').value) || 30,
    });
    showToast('Configuração salva');
  });
}

function configurarBotaoReset() {
  const btn = document.getElementById('cfg-reset-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (confirm('Tem certeza? Todos os dados da medição atual serão apagados.')) {
      store.resetMeasurement();
      showToast('Medição resetada');
    }
  });
}

// ============================================================
// TEMA
// ============================================================

function configurarTema() {
  const themeToggle = document.getElementById('cfg-theme-toggle');
  const themeLabel = document.getElementById('cfg-theme-label');
  const currentTheme = store.getTheme();

  if (currentTheme === 'light') {
    themeToggle.classList.add('active');
    themeLabel.textContent = 'Claro';
  } else {
    themeToggle.classList.remove('active');
    themeLabel.textContent = 'Escuro';
  }

  themeToggle.addEventListener('click', () => {
    const isLight = themeToggle.classList.contains('active');
    const newTheme = isLight ? 'dark' : 'light';
    store.setTheme(newTheme);
    themeToggle.classList.toggle('active');
    themeLabel.textContent = newTheme === 'light' ? 'Claro' : 'Escuro';
  });
}

// ============================================================
// ALARMES
// ============================================================

function configurarAlarmes() {
  const catSelect = document.getElementById('cfg-new-alarm-cat');
  catSelect.innerHTML = (store.config.alarmCategories || ['Interna', 'Externa']).map(c =>
    `<option value="${c}">${c}</option>`
  ).join('');

  renderAlarms();

  document.getElementById('cfg-add-alarm').addEventListener('click', () => {
    const nameInput = document.getElementById('cfg-new-alarm');
    const catSelect = document.getElementById('cfg-new-alarm-cat');
    if (nameInput.value.trim()) {
      store.addAlarm(nameInput.value.trim(), catSelect.value);
      nameInput.value = '';
      renderAlarms();
    }
  });

  document.getElementById('cfg-new-alarm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('cfg-add-alarm').click(); }
  });
}

function renderAlarms() {
  const list = document.getElementById('cfg-alarm-list');
  const alarms = store.config.alarms;
  const grouped = {};
  alarms.forEach((a, i) => {
    const cat = a.category || 'Interna';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ ...a, originalIndex: i });
  });

  let html = '';
  for (const [cat, items] of Object.entries(grouped)) {
    html += `<div class="alarm-category-label">${cat}</div>`;
    for (const item of items) {
      html += `<div class="alarm-item">
        <span>${item.name}</span>
        <button type="button" class="remove-alarm" data-index="${item.originalIndex}">×</button>
      </div>`;
    }
  }
  list.innerHTML = html;

  list.querySelectorAll('.remove-alarm').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      store.removeAlarm(parseInt(btn.dataset.index));
      renderAlarms();
    });
  });
}

// ============================================================
// TOAST
// ============================================================

function showToast(message, tipo = 'ok') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  const bg = tipo === 'erro' ? '#ef4444' : '#22c55e';
  toast.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:${bg};color:#fff;padding:10px 24px;border-radius:8px;font-size:0.875rem;font-weight:600;z-index:300;`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}