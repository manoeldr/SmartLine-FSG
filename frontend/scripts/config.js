// ============================================================
// CONFIG.JS — Tela de configuração
// Seções: Cliente, Linha, Fluxo da linha,
// Configuração da medição (turno, velocidade, alarmes)
// ============================================================

import { store } from './store.js';
import { api } from './api.js';

let estadoConfig = {
  clienteId: null,
  linhaId: null,
  maquinas: [],
};

let carregandoLinhas = false;
let carregandoMaquinas = false;

// Inicializa a tela de configuração com um delay para garantir que o DOM está pronto.
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

// Busca todos os clientes do backend e popula o select.
// Se houver um clienteId salvo no store, restaura a seleção e carrega as linhas.
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

// Configura o listener do select de cliente.
// Ao trocar o cliente, limpa linha e máquinas e salva o novo clienteId no store.
function configurarSelectCliente() {
  const select = document.getElementById('cfg-cliente-select');
  if (!select || select.dataset.listenerAdded) return;
  select.dataset.listenerAdded = 'true';
  select.addEventListener('change', async () => {
    estadoConfig.clienteId = select.value || null;
    estadoConfig.linhaId = null;
    store.updateConfig({
      clienteId: estadoConfig.clienteId,
      client: select.selectedOptions[0]?.text || '',
      linhaId: null,
      maquinaId: null,
    });
    limparLinhas();
    limparMaquinas();
    if (estadoConfig.clienteId) await carregarLinhas(estadoConfig.clienteId);
  });
}

// Configura o botão de adicionar cliente.
// Cria o cliente no backend, adiciona ao select e dispara o evento de change.
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

// Busca as linhas do cliente selecionado e popula o select.
// Guard `carregandoLinhas` evita chamadas simultâneas que causariam duplicação.
async function carregarLinhas(clienteId) {
  if (carregandoLinhas) return;
  carregandoLinhas = true;

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
  } finally {
    carregandoLinhas = false;
  }
}

// Configura o listener do select de linha.
// Ao trocar a linha, limpa as máquinas e salva o novo linhaId no store imediatamente.
function configurarSelectLinha() {
  const select = document.getElementById('cfg-linha-select');
  if (!select || select.dataset.listenerAdded) return;
  select.dataset.listenerAdded = 'true';
  select.addEventListener('change', async () => {
    estadoConfig.linhaId = select.value || null;
    store.updateConfig({ linhaId: estadoConfig.linhaId, maquinaId: null });
    limparMaquinas();
    if (estadoConfig.linhaId) await carregarMaquinas(estadoConfig.linhaId);
  });
}

// Configura o botão de adicionar linha.
// Cria a linha no backend vinculada ao cliente atual e dispara o evento de change.
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

// Reseta o select de linhas e oculta a seção. Também limpa as máquinas.
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

// Busca as máquinas da linha e renderiza o fluxo.
// Guard `carregandoMaquinas` evita chamadas simultâneas.
async function carregarMaquinas(linhaId) {
  if (carregandoMaquinas) return;
  carregandoMaquinas = true;

  const section = document.getElementById('cfg-maquinas-section');
  section.classList.remove('hidden');

  try {
    estadoConfig.maquinas = await api.listarMaquinas(linhaId);
  } catch {
    estadoConfig.maquinas = [];
  } finally {
    carregandoMaquinas = false;
  }

  renderMaquinas();
}

// Configura o botão de adicionar máquina.
// Define a ordem como o próximo número da sequência e cria no backend.
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
      input.value = '';
      showToast('Máquina adicionada');
    } catch (err) {
      showToast(err.message || 'Erro ao adicionar máquina', 'erro');
    }
  });
}

// Renderiza a lista de máquinas com drag-and-drop para reordenação.
// Máquinas críticas exibem ★. Cada item tem botão ⋮ para configurar e × para remover.
// Exibe indicador visual se velocidade nominal não estiver configurada.
function renderMaquinas() {
  const list = document.getElementById('cfg-maquinas-list');
  if (estadoConfig.maquinas.length === 0) {
    list.innerHTML = '<p class="empty-hint">Nenhuma máquina cadastrada ainda</p>';
    return;
  }

  list.innerHTML = estadoConfig.maquinas.map((m) => {
    const semVelocidade = !m.velocidade_nominal;
    return `
      <div class="maquina-item" draggable="true" data-id="${m.id}">
        <span class="drag-handle">⠿</span>
        <span class="maquina-ordem">${m.ordem}</span>
        <span class="maquina-nome">${m.nome}</span>
        ${m.critica ? '<span style="color:var(--brand);font-size:1rem;margin-right:4px;">★</span>' : ''}
        ${semVelocidade ? '<span style="color:var(--red);font-size:0.65rem;margin-right:4px;">⚠ vel.</span>' : ''}
        <button type="button" class="btn-icon config-maquina"
          data-id="${m.id}"
          data-nome="${m.nome}"
          data-velocidade="${m.velocidade_nominal || ''}"
          data-sobrevelocidade="${m.sobrevelocidade || ''}"
          data-multiplicador="${m.multiplicador_produto ?? 1}"
          data-critica="${m.critica ? 'true' : 'false'}"
          data-alarmes="${encodeURIComponent(m.alarmes || '[]')}">⋮</button>
        <button type="button" class="btn-icon remove-maquina" data-id="${m.id}">×</button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.config-maquina').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const nome = btn.dataset.nome;
      const velocidade = btn.dataset.velocidade;
      const sobrevelocidade = btn.dataset.sobrevelocidade;
      const multiplicador = btn.dataset.multiplicador;
      const critica = btn.dataset.critica === 'true';
      const alarmes = JSON.parse(decodeURIComponent(btn.dataset.alarmes));
      abrirModalConfigMaquina(id, nome, velocidade, sobrevelocidade, multiplicador, critica, alarmes);
    });
  });

  list.querySelectorAll('.remove-maquina').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      try {
        await api.deletarMaquina(estadoConfig.linhaId, id);
        estadoConfig.maquinas = estadoConfig.maquinas.filter(m => m.id !== id);
        renderMaquinas();
        showToast('Máquina removida');
      } catch {
        showToast('Erro ao remover máquina', 'erro');
      }
    });
  });

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

      novaOrdem.forEach(({ id, ordem }) => {
        const m = estadoConfig.maquinas.find(m => m.id === id);
        if (m) m.ordem = ordem;
      });
      estadoConfig.maquinas.sort((a, b) => a.ordem - b.ordem);

      try {
        await Promise.all(
          novaOrdem.map(({ id, ordem }) =>
            api.atualizarMaquina(estadoConfig.linhaId, id, { ordem })
          )
        );
        renderMaquinas();
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

// Limpa a lista de máquinas e oculta a seção do fluxo da linha.
function limparMaquinas() {
  estadoConfig.maquinas = [];
  const section = document.getElementById('cfg-maquinas-section');
  const list = document.getElementById('cfg-maquinas-list');
  if (section) section.classList.add('hidden');
  if (list) list.innerHTML = '';
}

// ============================================================
// MODAL: CONFIGURAR MÁQUINA
// ============================================================

// Abre o modal de configuração de uma máquina específica.
// Todos os campos são exibidos independente de ser crítica ou não.
// Velocidade nominal e sobrevelocidade são obrigatórios para cálculos corretos.
// O toggle de crítica apenas define qual máquina é a referência da linha.
function abrirModalConfigMaquina(maquinaId, nome, velocidade, sobrevelocidade, multiplicador = 1, critica = false, alarmes) {
  document.getElementById('modal-config-maquina')?.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-config-maquina';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <h3>${nome}</h3>
      <p class="modal-sub">Configuração específica desta máquina</p>

      <!-- Velocidade nominal — obrigatória para todas as máquinas -->
      <div class="form-group">
        <label>Velocidade nominal (unidades/hora) <span style="color:var(--red)">*</span></label>
        <input type="number" id="modal-maq-velocidade" class="input" placeholder="Ex: 12000" value="${velocidade}" inputmode="numeric">
        <p class="modal-sub" style="margin-top:4px;">Velocidade de operação padrão da máquina.</p>
      </div>

      <!-- Sobrevelocidade — obrigatória para todas as máquinas -->
      <div class="form-group">
        <label>Sobrevelocidade (% acima da nominal) <span style="color:var(--red)">*</span></label>
        <input type="number" step="0.1" min="0" id="modal-maq-sobrevelocidade" class="input" placeholder="Ex: 10 (significa 10% acima)" value="${sobrevelocidade}" inputmode="numeric">
        <p class="modal-sub" style="margin-top:4px;">Velocidade máxima para compensar paradas na linha.</p>
      </div>

      <div class="form-group">
        <label>Multiplicador de produto</label>
        <input type="number" step="0.01" min="0.01" id="modal-maq-multiplicador" class="input" placeholder="Ex: 24 (garrafas por caixa)" value="${multiplicador}">
        <p class="modal-sub" style="margin-top:4px;">Aplicado sobre a velocidade para cálculo de unidades finais.</p>
      </div>

      <!-- Toggle crítica — define qual máquina é a referência da linha -->
      <div class="theme-toggle-row" style="margin-bottom:16px;">
        <div class="theme-toggle-info">
          <span class="theme-toggle-label">Máquina crítica</span>
          <span class="theme-toggle-value" id="modal-maq-critica-label">${critica ? 'Sim' : 'Não'}</span>
        </div>
        <button class="theme-toggle ${critica ? 'active' : ''}" id="modal-maq-critica-toggle" aria-label="Máquina crítica">
          <span class="theme-toggle-thumb">
            <svg class="icon-moon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74z"/></svg>
            <svg class="icon-sun" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74z"/></svg>
          </span>
        </button>
      </div>

      <div class="form-group">
        <label>Alarmes / motivos de parada</label>
        <div id="modal-maq-alarm-list" style="margin-bottom:8px;"></div>
        <div class="form-row">
          <input type="text" id="modal-maq-new-alarm" class="input flex-1" placeholder="Novo alarme...">
          <select id="modal-maq-new-alarm-cat" class="input" style="width:auto;min-width:100px">
            <option value="Interna">Interna</option>
            <option value="Externa">Externa</option>
          </select>
          <button type="button" class="btn btn-sm" id="modal-maq-add-alarm">+</button>
        </div>
      </div>

      <button type="button" class="btn btn-primary btn-block" id="modal-maq-salvar" style="margin-top:8px;">Salvar</button>
      <button type="button" class="btn btn-outline btn-block" id="modal-maq-cancelar" style="margin-top:8px;">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);

  // Toggle crítica — apenas muda o label, não esconde campos
  let criticaAtual = critica;
  const toggle = document.getElementById('modal-maq-critica-toggle');
  const label = document.getElementById('modal-maq-critica-label');

  toggle.addEventListener('click', () => {
    criticaAtual = !criticaAtual;
    toggle.classList.toggle('active', criticaAtual);
    label.textContent = criticaAtual ? 'Sim' : 'Não';
  });

  let alarmesList = [...alarmes];

  // Renderiza a lista de alarmes com botão de remoção por índice.
  function renderAlarmesList() {
    const list = document.getElementById('modal-maq-alarm-list');
    if (alarmesList.length === 0) {
      list.innerHTML = '<p style="font-size:0.8rem;color:var(--text-dim);margin-bottom:8px;">Nenhum alarme cadastrado</p>';
      return;
    }
    list.innerHTML = alarmesList.map((a, i) => `
      <div class="alarm-item">
        <span>${a.name} <span style="font-size:0.7rem;color:var(--text-dim);">(${a.category})</span></span>
        <button type="button" class="remove-alarm" data-index="${i}">×</button>
      </div>
    `).join('');
    list.querySelectorAll('.remove-alarm').forEach(btn => {
      btn.addEventListener('click', () => {
        alarmesList.splice(parseInt(btn.dataset.index), 1);
        renderAlarmesList();
      });
    });
  }

  renderAlarmesList();

  // Adiciona novo alarme à lista local ao clicar no botão +.
  document.getElementById('modal-maq-add-alarm').addEventListener('click', () => {
    const input = document.getElementById('modal-maq-new-alarm');
    const cat = document.getElementById('modal-maq-new-alarm-cat').value;
    const nomeAlarme = input.value.trim();
    if (!nomeAlarme) return;
    if (!alarmesList.find(a => a.name === nomeAlarme)) {
      alarmesList.push({ name: nomeAlarme, category: cat });
      renderAlarmesList();
    }
    input.value = '';
  });

  // Salva todas as configurações no backend.
  // Valida velocidade nominal obrigatória antes de salvar.
  document.getElementById('modal-maq-salvar').addEventListener('click', async () => {
    const velocidadeRaw = document.getElementById('modal-maq-velocidade').value.trim();
    const velocidadeVal = velocidadeRaw !== '' ? parseFloat(velocidadeRaw) : null;
    const sobrevelocidadeRaw = document.getElementById('modal-maq-sobrevelocidade').value.trim();
    const sobrevelocidadeVal = sobrevelocidadeRaw !== '' ? parseFloat(sobrevelocidadeRaw) : null;
    const multiplicadorVal = parseFloat(document.getElementById('modal-maq-multiplicador').value) || 1;

    if (!velocidadeVal) {
      document.getElementById('modal-maq-velocidade').style.borderColor = 'var(--red)';
      showToast('Informe a velocidade nominal', 'erro');
      return;
    }

    document.getElementById('modal-maq-velocidade').style.borderColor = '';

    try {
      await api.atualizarMaquina(estadoConfig.linhaId, maquinaId, {
        velocidade_nominal: velocidadeVal,
        sobrevelocidade: sobrevelocidadeVal,
        multiplicador_produto: multiplicadorVal,
        critica: criticaAtual,
        alarmes: JSON.stringify(alarmesList),
      });
      const m = estadoConfig.maquinas.find(m => m.id === maquinaId);
      if (m) {
        m.velocidade_nominal = velocidadeVal;
        m.sobrevelocidade = sobrevelocidadeVal;
        m.multiplicador_produto = multiplicadorVal;
        m.critica = criticaAtual;
        m.alarmes = JSON.stringify(alarmesList);
        if (criticaAtual) {
          estadoConfig.maquinas.forEach(maq => {
            if (maq.id !== maquinaId) maq.critica = false;
          });
        }
      }
      modal.remove();
      renderMaquinas();
      showToast('Configuração salva');
    } catch (err) {
      showToast(err.message || 'Erro ao salvar', 'erro');
    }
  });

  document.getElementById('modal-maq-cancelar').addEventListener('click', () => modal.remove());
}

// ============================================================
// SEÇÃO 4 — CONFIGURAÇÃO DA MEDIÇÃO
// ============================================================

// Preenche os campos da seção de medição com os valores salvos no store.
function preencherConfigMedicao() {
  const cfg = store.config;
  const speedEl = document.getElementById('cfg-speed');
  if (speedEl) speedEl.value = cfg.speed || '';
  document.getElementById('cfg-shift-start').value = cfg.shiftStart || '08:00';
  document.getElementById('cfg-shift-end').value = cfg.shiftEnd || '17:00';
  document.getElementById('cfg-prod-interval').value = cfg.productionInterval || 30;
}

// Configura o botão salvar. Persiste cliente, linha, turno e intervalo no store.
function configurarBotaoSalvar() {
  const btn = document.getElementById('cfg-save-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const speedEl = document.getElementById('cfg-speed');
    store.updateConfig({
      clienteId: estadoConfig.clienteId,
      linhaId: estadoConfig.linhaId,
      client: document.getElementById('cfg-cliente-select')?.selectedOptions[0]?.text || store.config.client || '',
      speed: speedEl ? parseInt(speedEl.value) || 0 : store.config.speed,
      shiftStart: document.getElementById('cfg-shift-start').value,
      shiftEnd: document.getElementById('cfg-shift-end').value,
      productionInterval: parseInt(document.getElementById('cfg-prod-interval').value) || 30,
    });
    showToast('Configuração salva');
  });
}

// Configura o botão de reset. Apaga todos os dados da medição ativa após confirmação.
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

// Configura o toggle de tema claro/escuro. Persiste a preferência via store.
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
// ALARMES (globais — mantidos para compatibilidade)
// ============================================================

// Inicializa a seção de alarmes globais. Renderiza a lista existente e configura
// os botões de adicionar e remover. Retorna silenciosamente se a seção estiver oculta.
function configurarAlarmes() {
  const catSelect = document.getElementById('cfg-new-alarm-cat');
  if (!catSelect) return;

  catSelect.innerHTML = (store.config.alarmCategories || ['Interna', 'Externa']).map(c =>
    `<option value="${c}">${c}</option>`
  ).join('');

  renderAlarms();

  document.getElementById('cfg-add-alarm')?.addEventListener('click', () => {
    const nameInput = document.getElementById('cfg-new-alarm');
    const catSelect = document.getElementById('cfg-new-alarm-cat');
    if (nameInput.value.trim()) {
      store.addAlarm(nameInput.value.trim(), catSelect.value);
      nameInput.value = '';
      renderAlarms();
    }
  });

  document.getElementById('cfg-new-alarm')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('cfg-add-alarm').click(); }
  });
}

// Renderiza a lista de alarmes globais agrupados por categoria.
function renderAlarms() {
  const list = document.getElementById('cfg-alarm-list');
  if (!list) return;
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

// Exibe uma notificação temporária no topo da tela.
// tipo: 'ok' (verde) | 'erro' (vermelho). Some após 2.5 segundos.
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