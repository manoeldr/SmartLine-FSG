// ============================================================
// CONFIG.JS — Tela de configuração
// ============================================================

import { store } from './store.js';
import { api } from './api.js';

const BTN_WISE = `padding:4px 10px;font-size:0.75rem;font-weight:600;background:var(--brand);border:1.5px solid var(--brand);border-radius:var(--radius-sm);color:#fff;cursor:pointer;transition:opacity 0.15s;display:inline-flex;align-items:center;gap:4px;`;

let estadoConfig = {
  clienteId: null,
  linhaId: null,
  maquinas: [],
};

let carregandoLinhas = false;
let carregandoMaquinas = false;

export function initConfig() {
  setTimeout(() => {
    configurarSelectCliente();
    configurarSelectLinha();
    configurarBotaoAdicionarCliente();
    configurarBotaoAdicionarLinha();
    configurarBotaoAdicionarMaquina();
    configurarBotaoSalvar();
    configurarBotaoReset();
    configurarBotaoUsuarios();
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
    select.innerHTML = '<option value="">Selecionar um cliente</option>';
    clientes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nome;
      select.appendChild(opt);
    });
    const saved = store.config.clienteId;
    if (saved) {
      const optionExists = Array.from(select.options).some(opt => opt.value == saved);
      if (optionExists) {
        select.value = saved;
        estadoConfig.clienteId = saved;
        await carregarLinhas(saved);
      } else {
        select.value = '';
      }
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
  if (carregandoLinhas) return;
  carregandoLinhas = true;
  const select = document.getElementById('cfg-linha-select');
  const section = document.getElementById('cfg-linha-section');
  section.classList.remove('hidden');
  select.innerHTML = '<option value="">Selecionar uma linha</option>';
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
      const optionExists = Array.from(select.options).some(opt => opt.value == saved);
      if (optionExists) {
        select.value = saved;
        estadoConfig.linhaId = saved;
        await carregarMaquinas(saved);
      } else {
        select.value = '';
      }
    }
  } catch {
    showToast('Erro ao carregar linhas', 'erro');
  } finally {
    carregandoLinhas = false;
  }
}

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
  select.innerHTML = '<option value="">Selecionar uma linha</option>';
  section.classList.add('hidden');
  limparMaquinas();
}

// ============================================================
// SEÇÃO 3 — FLUXO DA LINHA (máquinas)
// ============================================================

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

function renderMaquinas() {
  const list = document.getElementById('cfg-maquinas-list');
  if (estadoConfig.maquinas.length === 0) {
    list.innerHTML = '<p class="empty-hint">Nenhuma máquina cadastrada ainda</p>';
    return;
  }

  list.innerHTML = estadoConfig.maquinas.map((m) => {
    const faltaVar = (!m.velocidade_nominal || m.sobrevelocidade === null || m.sobrevelocidade === undefined || m.sobrevelocidade === '');
    return `
      <div class="maquina-item" draggable="true" data-id="${m.id}">
        <span class="drag-handle" style="touch-action:none;">⠿</span>
        <span class="maquina-ordem">${m.ordem}</span>
        <span class="maquina-nome">${m.nome}</span>
        ${m.critica ? '<span style="color:var(--brand);font-size:1rem;margin-right:4px;">★</span>' : ''}
        ${m.tem_refugo ? '<span style="color:var(--amber);font-size:0.65rem;margin-right:4px;" title="Controla refugo">♻</span>' : ''}
        ${faltaVar ? '<span style="color:var(--red);font-size:0.65rem;margin-right:4px;" title="Velocidade ou Sobrevelocidade pendente">⚠ config</span>' : ''}
        <button type="button" class="btn-icon config-maquina"
          data-id="${m.id}"
          data-nome="${m.nome}"
          data-velocidade="${m.velocidade_nominal || ''}"
          data-sobrevelocidade="${m.sobrevelocidade || ''}"
          data-multiplicador="${m.multiplicador_produto ?? 1}"
          data-critica="${m.critica ? 'true' : 'false'}"
          data-tem-refugo="${m.tem_refugo ? 'true' : 'false'}"
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
      const temRefugo = btn.dataset.temRefugo === 'true';
      const alarmes = JSON.parse(decodeURIComponent(btn.dataset.alarmes));
      abrirModalConfigMaquina(id, nome, velocidade, sobrevelocidade, multiplicador, critica, temRefugo, alarmes);
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

  // ── Drag and drop ─────────────────────────────────────────
  let dragging = null;
  let dragClone = null;
  let offsetY = 0;

  async function salvarNovaOrdem() {
    const items = [...list.querySelectorAll('.maquina-item')];
    const novaOrdem = items.map((el, i) => ({ id: parseInt(el.dataset.id), ordem: i + 1 }));
    novaOrdem.forEach(({ id, ordem }) => {
      const m = estadoConfig.maquinas.find(m => m.id === id);
      if (m) m.ordem = ordem;
    });
    estadoConfig.maquinas.sort((a, b) => a.ordem - b.ordem);
    try {
      await Promise.all(novaOrdem.map(({ id, ordem }) => api.atualizarMaquina(estadoConfig.linhaId, id, { ordem })));
      renderMaquinas();
      showToast('Ordem salva');
    } catch {
      showToast('Erro ao salvar nova ordem', 'erro');
    }
  }

  list.querySelectorAll('.maquina-item').forEach(item => {
    const handle = item.querySelector('.drag-handle');

    item.addEventListener('dragstart', (e) => { dragging = item; item.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    item.addEventListener('dragend', async () => { item.classList.remove('dragging'); dragging = null; await salvarNovaOrdem(); });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dragging && dragging !== item) {
        const rect = item.getBoundingClientRect();
        list.insertBefore(dragging, e.clientY < rect.top + rect.height / 2 ? item : item.nextSibling);
      }
    });

    handle.addEventListener('touchstart', (e) => {
      e.preventDefault();
      dragging = item;
      item.classList.add('dragging');
      dragClone = item.cloneNode(true);
      const rect = item.getBoundingClientRect();
      dragClone.style.cssText = `position:fixed;z-index:9999;width:${rect.width}px;left:${rect.left}px;opacity:0.9;pointer-events:none;background:var(--bg-card);border:1.5px solid var(--brand);border-radius:var(--radius-sm);box-shadow:0 8px 24px rgba(0,0,0,0.2);padding:12px 4px;`;
      const touch = e.touches[0];
      offsetY = touch.clientY - rect.top;
      dragClone.style.top = `${touch.clientY - offsetY}px`;
      document.body.appendChild(dragClone);
    }, { passive: false });

    handle.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!dragging || !dragClone) return;
      const touch = e.touches[0];
      dragClone.style.top = `${touch.clientY - offsetY}px`;
      dragClone.style.display = 'none';
      const elBelow = document.elementFromPoint(touch.clientX, touch.clientY);
      dragClone.style.display = '';
      const targetItem = elBelow?.closest('.maquina-item');
      if (targetItem && targetItem !== dragging) {
        const rect = targetItem.getBoundingClientRect();
        list.insertBefore(dragging, touch.clientY < rect.top + rect.height / 2 ? targetItem : targetItem.nextSibling);
      }
    }, { passive: false });

    handle.addEventListener('touchend', async () => {
      if (dragClone) { dragClone.remove(); dragClone = null; }
      if (dragging) { dragging.classList.remove('dragging'); dragging = null; }
      await salvarNovaOrdem();
    });
  });
}

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

async function abrirModalConfigMaquina(maquinaId, nome, velocidade, sobrevelocidade, multiplicador = 1, critica = false, temRefugo = false, alarmes) {
  document.getElementById('modal-config-maquina')?.remove();

  let wiseDevices = [];
  try { wiseDevices = await api.listarWiseDevices(estadoConfig.linhaId, maquinaId); } catch { }
  const tipoAtual = 'manual';

  const modal = document.createElement('div');
  modal.id = 'modal-config-maquina';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <h3>${nome}</h3>
      <p class="modal-sub">Configuração específica desta máquina</p>

      <!-- Seletor de tipo de medição -->
      <div style="margin-bottom:20px;">
        <label style="font-size:0.75rem;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.6px;display:block;margin-bottom:10px;">Tipo de medição</label>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <button type="button" class="cfg-tipo-btn ${tipoAtual === 'manual' ? 'active' : ''}" data-tipo="manual">
            <svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="currentColor" style="margin-bottom:4px;"><path d="M240-160v-640 640ZM637-40q-26 0-49-10.5T548-80L346-322l45-46q18-18 44-22.5t49 7.5l116 58v-355h80q66 0 113 47t47 113v320q0 66-47 113T680-40h-43ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h360q33 0 56.5 23.5T680-800v120h-80v-120H240v640h241l67 80H240Zm208.5-611.5Q460-703 460-720t-11.5-28.5Q437-760 420-760t-28.5 11.5Q380-737 380-720t11.5 28.5Q403-680 420-680t28.5-11.5ZM637-120h43q33 0 56.5-23t23.5-57v-320q0-33-23.5-56.5T680-600v405L468-302l138 168q6 7 14 10.5t17 3.5Z"/></svg>
            <span style="font-size:0.8rem;font-weight:600;display:block;">Manual</span>
            <span style="font-size:0.7rem;color:inherit;opacity:0.75;display:block;">Pelo celular</span>
          </button>
          <button type="button" class="cfg-tipo-btn ${tipoAtual === 'semiautomatico' ? 'active' : ''}" data-tipo="semiautomatico">
            <svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="currentColor" style="margin-bottom:4px;"><path d="M280-200q-33 0-56.5-23.5T200-280v-400q0-33 23.5-56.5T280-760h400q33 0 56.5 23.5T760-680v400q0 33-23.5 56.5T680-200H280Zm0 80h400q66 0 113-47t47-113v-400q0-66-47-113t-113-47H280q-66 0-113 47t-47 113v400q0 66 47 113t113 47Zm11-379-55-55q42-51 108.5-78.5T480-660q67 0 134 27.5T723-554l-55 55q-35-38-83.5-59.5T480-580q-56 0-104.5 21.5T291-499Zm114 114-57-57q26-28 60.5-43t72.5-15q38 0 71.5 15t59.5 43l-56 57q-14-15-34.5-25T480-420q-21 0-41 10t-34 25Zm46.5 93.5Q440-303 440-320t11.5-28.5Q463-360 480-360t28.5 11.5Q520-337 520-320t-11.5 28.5Q497-280 480-280t-28.5-11.5ZM480-480Z"/></svg>
            <span style="font-size:0.8rem;font-weight:600;display:block;">Semi Auto</span>
            <span style="font-size:0.7rem;color:inherit;opacity:0.75;display:block;">Via IOT</span>
          </button>
          <button type="button" class="cfg-tipo-btn cfg-tipo-btn--disabled" data-tipo="automatico" disabled title="Em breve">
            <svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="currentColor" style="margin-bottom:4px;"><path d="M160-120v-200q0-33 23.5-56.5T240-400h480q33 0 56.5 23.5T800-320v200H160Zm200-320q-83 0-141.5-58.5T160-640q0-83 58.5-141.5T360-840h240q83 0 141.5 58.5T800-640q0 83-58.5 141.5T600-440H360ZM240-200h480v-120H240v120Zm120-320h240q50 0 85-35t35-85q0-50-35-85t-85-35H360q-50 0-85 35t-35 85q0 50 35 85t85 35Zm28.5-91.5Q400-623 400-640t-11.5-28.5Q377-680 360-680t-28.5 11.5Q320-657 320-640t11.5 28.5Q343-600 360-600t28.5-11.5Zm240 0Q640-623 640-640t-11.5-28.5Q617-680 600-680t-28.5 11.5Q560-657 560-640t11.5 28.5Q583-600 600-600t28.5-11.5ZM480-200Zm0-440Z"/></svg>
            <span style="font-size:0.8rem;font-weight:600;display:block;">Automático</span>
            <span style="font-size:0.7rem;color:inherit;opacity:0.75;display:block;">Em breve</span>
          </button>
        </div>
      </div>

      <!-- Campos comuns -->
      <div class="form-group">
        <label>Velocidade nominal (unidades/hora) <span style="color:var(--red)">*</span></label>
        <input type="number" id="modal-maq-velocidade" class="input" placeholder="Ex: 12000" value="${velocidade}" inputmode="numeric">
        <p class="modal-sub" style="margin-top:4px;">Velocidade de operação padrão da máquina.</p>
      </div>
      <div class="form-group">
        <label>Sobrevelocidade (% acima da nominal) <span style="color:var(--red)">*</span></label>
        <input type="number" step="0.1" min="0" id="modal-maq-sobrevelocidade" class="input" placeholder="Ex: 10" value="${sobrevelocidade}" inputmode="numeric">
        <p class="modal-sub" style="margin-top:4px;">Velocidade máxima para compensar paradas na linha.</p>
      </div>
      <div class="form-group">
        <label>Multiplicador de produto</label>
        <input type="number" step="0.01" min="0.01" id="modal-maq-multiplicador" class="input" placeholder="Ex: 24" value="${multiplicador}">
        <p class="modal-sub" style="margin-top:4px;">Aplicado sobre a velocidade para cálculo de unidades finais.</p>
      </div>

      <!-- Toggle: Máquina crítica -->
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

      <!-- Toggle: Controla refugo -->
      <div class="theme-toggle-row" style="margin-bottom:16px;">
        <div class="theme-toggle-info">
          <span class="theme-toggle-label">Controla refugo</span>
          <span class="theme-toggle-value" id="modal-maq-refugo-label">${temRefugo ? 'Sim' : 'Não'}</span>
        </div>
        <button class="theme-toggle ${temRefugo ? 'active' : ''}" id="modal-maq-refugo-toggle" aria-label="Controla refugo">
          <span class="theme-toggle-thumb">
            <svg class="icon-moon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74z"/></svg>
            <svg class="icon-sun" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74z"/></svg>
          </span>
        </button>
      </div>

      <!-- Seção Manual: alarmes -->
      <div id="cfg-secao-alarmes">
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
      </div>

      <!-- Seção Semi Auto: WISE -->
      <div id="cfg-secao-wise" class="hidden">
        <div style="border-top:1px solid var(--border);margin:8px 0 16px;"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div>
            <p style="font-size:0.875rem;font-weight:600;color:var(--text);margin:0;">Dispositivos WISE</p>
            <p class="modal-sub" style="margin:2px 0 0;">Sensores IOT conectados a esta máquina</p>
          </div>
          <button type="button" id="btn-wise-add-device" style="${BTN_WISE}">+ Adicionar</button>
        </div>
        <div id="wise-devices-list"></div>

        <div style="border-top:1px solid var(--border);margin:16px 0 10px;"></div>
        <div style="margin-bottom:10px;">
          <p style="font-size:0.875rem;font-weight:600;color:var(--text);margin:0 0 2px;">Fórmulas de cálculo</p>
          <p class="modal-sub" style="margin:0;">Defina como calcular produção e refugo</p>
        </div>
        <div id="wise-formulas-list"></div>
        <button type="button" id="btn-wise-add-formula" class="btn btn-primary btn-block" style="margin-top:8px;">+ Adicionar fórmula</button>
      </div>

      <button type="button" class="btn btn-primary btn-block" id="modal-maq-salvar" style="margin-top:16px;">Salvar</button>
      <button type="button" class="btn btn-outline btn-block" id="modal-maq-cancelar" style="margin-top:8px;">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);

  // ── Estado interno ────────────────────────────────────────
  let tipoSelecionado = tipoAtual;
  let criticaAtual = critica;
  let temRefugoAtual = temRefugo;
  let alarmesList = [...alarmes];
  let devicesWise = [...wiseDevices];
  let formulasWise = [];
  try { formulasWise = await api.listarWiseFormulas(estadoConfig.linhaId, maquinaId); } catch { }

  // ── Toggle crítica ────────────────────────────────────────
  const toggleCritica = document.getElementById('modal-maq-critica-toggle');
  const labelCritica = document.getElementById('modal-maq-critica-label');
  toggleCritica.addEventListener('click', () => {
    criticaAtual = !criticaAtual;
    toggleCritica.classList.toggle('active', criticaAtual);
    labelCritica.textContent = criticaAtual ? 'Sim' : 'Não';
  });

  // ── Toggle refugo ─────────────────────────────────────────
  const toggleRefugo = document.getElementById('modal-maq-refugo-toggle');
  const labelRefugo = document.getElementById('modal-maq-refugo-label');
  toggleRefugo.addEventListener('click', () => {
    temRefugoAtual = !temRefugoAtual;
    toggleRefugo.classList.toggle('active', temRefugoAtual);
    labelRefugo.textContent = temRefugoAtual ? 'Sim' : 'Não';
  });

  // ── Seletor de tipo ───────────────────────────────────────
  function atualizarVisibilidade() {
    const secaoAlarmes = document.getElementById('cfg-secao-alarmes');
    const secaoWise = document.getElementById('cfg-secao-wise');
    if (tipoSelecionado === 'manual') {
      secaoAlarmes.classList.remove('hidden');
      secaoWise.classList.add('hidden');
    } else if (tipoSelecionado === 'semiautomatico') {
      secaoAlarmes.classList.add('hidden');
      secaoWise.classList.remove('hidden');
      renderWiseDevices();
      renderWiseFormulas();
    }
  }

  modal.querySelectorAll('.cfg-tipo-btn:not(.cfg-tipo-btn--disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      tipoSelecionado = btn.dataset.tipo;
      modal.querySelectorAll('.cfg-tipo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      atualizarVisibilidade();
    });
  });

  // ── Alarmes ───────────────────────────────────────────────
  function renderAlarmesList() {
    const list = document.getElementById('modal-maq-alarm-list');
    if (!list) return;
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

  document.getElementById('modal-maq-add-alarm')?.addEventListener('click', () => {
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

  // ── WISE Devices ──────────────────────────────────────────
  const pingIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" height="13px" viewBox="0 -960 960 960" width="13px" fill="currentColor"><path d="M160-240v-80h260L80-660l56-56 344 343 208-208q-4-9-6-18.5t-2-20.5q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29q-9 0-17.5-1.5T746-526L540-320h260v80H160Z"/></svg>`;
  const BTN_DEL = `background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:1.125rem;line-height:1;padding:0 4px;transition:color 0.15s;`;

  function renderWiseDevices() {
    const container = document.getElementById('wise-devices-list');
    if (!container) return;
    if (devicesWise.length === 0) {
      container.innerHTML = '<p style="font-size:0.8rem;color:var(--text-dim);text-align:center;padding:8px 0;">Nenhum dispositivo cadastrado</p>';
      return;
    }
    container.innerHTML = devicesWise.map(d => `
      <div class="wise-device-item" data-id="${d.id}" style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <span style="font-size:0.875rem;font-weight:600;color:var(--text);">${d.posicao}</span>
            <span style="font-size:0.75rem;color:var(--text-dim);margin-left:8px;">${d.ip}</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <button type="button" class="btn-wise-ping" data-id="${d.id}" style="${BTN_WISE}">${pingIconSvg} Ping</button>
            <button type="button" class="btn-wise-channels" data-id="${d.id}" style="${BTN_WISE}">Canais</button>
            <button type="button" class="btn-wise-delete" data-id="${d.id}" style="${BTN_DEL}"
              onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--text-dim)'">×</button>
          </div>
        </div>
        <div class="wise-ping-result" data-id="${d.id}" style="display:none;font-size:0.75rem;margin-top:6px;"></div>
        <div class="wise-channels-panel" data-id="${d.id}" style="display:none;margin-top:8px;"></div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-wise-ping').forEach(btn => {
      btn.addEventListener('click', async () => {
        const deviceId = parseInt(btn.dataset.id);
        const resultEl = container.querySelector(`.wise-ping-result[data-id="${deviceId}"]`);
        resultEl.style.display = 'block';
        resultEl.style.color = 'var(--text-dim)';
        resultEl.textContent = 'Testando...';
        try {
          const res = await api.pingWiseDevice(estadoConfig.linhaId, maquinaId, deviceId);
          if (res.ok) {
            resultEl.textContent = `✓ Conectado — ${res.canais?.length || 0} canais lidos`;
            resultEl.style.color = 'var(--green)';
          } else {
            resultEl.textContent = `✗ Falha: ${res.erro || 'sem resposta'}`;
            resultEl.style.color = 'var(--red)';
          }
        } catch {
          resultEl.textContent = '✗ Erro ao conectar';
          resultEl.style.color = 'var(--red)';
        }
      });
    });

    container.querySelectorAll('.btn-wise-channels').forEach(btn => {
      btn.addEventListener('click', async () => {
        const deviceId = parseInt(btn.dataset.id);
        const panel = container.querySelector(`.wise-channels-panel[data-id="${deviceId}"]`);
        if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
        panel.style.display = 'block';
        panel.innerHTML = '<p style="font-size:0.75rem;color:var(--text-dim);">Carregando...</p>';
        try {
          const canais = await api.listarWiseChannels(estadoConfig.linhaId, maquinaId, deviceId);
          renderWiseChannels(panel, deviceId, canais);
        } catch {
          panel.innerHTML = '<p style="font-size:0.75rem;color:var(--red);">Erro ao carregar canais</p>';
        }
      });
    });

    container.querySelectorAll('.btn-wise-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const deviceId = parseInt(btn.dataset.id);
        if (!confirm('Remover este dispositivo e todos os seus canais?')) return;
        try {
          await api.deletarWiseDevice(estadoConfig.linhaId, maquinaId, deviceId);
          devicesWise = devicesWise.filter(d => d.id !== deviceId);
          renderWiseDevices();
          showToast('Dispositivo removido');
        } catch {
          showToast('Erro ao remover dispositivo', 'erro');
        }
      });
    });
  }

  // ── WISE Channels ─────────────────────────────────────────
  function renderWiseChannels(panel, deviceId, canais) {
    const funcaoLabel = { marcha_parada: 'Marcha/Parada', contagem: 'Contagem', alarme: 'Alarme' };
    panel.innerHTML = `
      <div style="border-top:1px solid var(--border);padding-top:10px;">
        <p style="font-size:0.7rem;font-weight:600;color:var(--text-dim);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Canais configurados</p>
        ${canais.length === 0
          ? '<p style="font-size:0.8rem;color:var(--text-dim);margin-bottom:10px;">Nenhum canal cadastrado</p>'
          : canais.map(c => `
            <div class="alarm-item" style="margin-bottom:6px;">
              <span style="font-size:0.8125rem;">
                <strong style="color:var(--text-dim);margin-right:6px;">Ch ${c.numero_canal}</strong>
                ${c.tipo} — ${funcaoLabel[c.funcao] || c.funcao}
                ${c.funcao === 'marcha_parada' || c.funcao === 'contagem'
                  ? `<span style="font-size:0.7rem;color:var(--text-dim);margin-left:6px;">${c.tempo_sem_alteracao_segundos}s sem sinal</span>`
                  : ''}
                ${c.alarme_motivo
                  ? `<span style="font-size:0.7rem;color:var(--amber);margin-left:6px;">${c.alarme_motivo}</span>`
                  : ''}
              </span>
              <button type="button" class="btn-del-channel remove-alarm" data-device="${deviceId}" data-channel="${c.id}">×</button>
            </div>
          `).join('')}
        <p style="font-size:0.7rem;font-weight:600;color:var(--text-dim);margin:12px 0 8px;text-transform:uppercase;letter-spacing:0.5px;">Novo canal</p>
        <div class="form-group">
          <label>Número do canal (0–7)</label>
          <input type="number" class="input ch-numero" placeholder="Ex: 0" min="0" max="7">
        </div>
        <div class="form-row">
          <div class="form-group flex-1">
            <label>Tipo de sinal</label>
            <select class="input ch-tipo">
              <option value="DI">DI — Digital</option>
              <option value="Counter">Counter — Pulsos</option>
            </select>
          </div>
          <div class="form-group flex-1">
            <label>Função</label>
            <select class="input ch-funcao">
              <option value="contagem">Contagem</option>
              <option value="marcha_parada">Marcha/Parada</option>
              <option value="alarme">Alarme</option>
            </select>
          </div>
        </div>
        <div class="form-group ch-motivo-group" style="display:none;">
          <label>Motivo do alarme</label>
          <input type="text" class="input ch-motivo" placeholder="Ex: Falta de matéria-prima">
        </div>
        <div class="form-group">
          <label>Tempo sem sinal para considerar parada (segundos)</label>
          <input type="number" class="input ch-threshold" value="30" min="5">
        </div>
        <button type="button" class="btn btn-primary btn-block btn-add-channel" data-device="${deviceId}">+ Adicionar canal</button>
      </div>
    `;

    const funcaoSelect = panel.querySelector('.ch-funcao');
    const motivoGroup = panel.querySelector('.ch-motivo-group');
    funcaoSelect.addEventListener('change', () => {
      motivoGroup.style.display = funcaoSelect.value === 'alarme' ? '' : 'none';
    });

    panel.querySelectorAll('.btn-del-channel').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.deletarWiseChannel(estadoConfig.linhaId, maquinaId, parseInt(btn.dataset.device), parseInt(btn.dataset.channel));
          const novos = await api.listarWiseChannels(estadoConfig.linhaId, maquinaId, parseInt(btn.dataset.device));
          renderWiseChannels(panel, parseInt(btn.dataset.device), novos);
          showToast('Canal removido');
        } catch { showToast('Erro ao remover canal', 'erro'); }
      });
    });

    panel.querySelector('.btn-add-channel')?.addEventListener('click', async () => {
      const numero = parseInt(panel.querySelector('.ch-numero').value);
      const tipo = panel.querySelector('.ch-tipo').value;
      const funcao = panel.querySelector('.ch-funcao').value;
      const motivo = panel.querySelector('.ch-motivo').value.trim();
      const threshold = parseInt(panel.querySelector('.ch-threshold').value) || 30;
      if (isNaN(numero)) { showToast('Informe o número do canal', 'erro'); return; }
      if (funcao === 'alarme' && !motivo) { showToast('Informe o motivo do alarme', 'erro'); return; }
      try {
        await api.criarWiseChannel(estadoConfig.linhaId, maquinaId, deviceId, {
          numero_canal: numero, tipo, funcao,
          alarme_motivo: funcao === 'alarme' ? motivo : null,
          tempo_sem_alteracao_segundos: threshold,
          ativo: true,
        });
        const novos = await api.listarWiseChannels(estadoConfig.linhaId, maquinaId, deviceId);
        renderWiseChannels(panel, deviceId, novos);
        showToast('Canal adicionado');
      } catch (err) { showToast(err.message || 'Erro ao adicionar canal', 'erro'); }
    });
  }

  // ── WISE Formulas ─────────────────────────────────────────
  function renderWiseFormulas() {
    const container = document.getElementById('wise-formulas-list');
    if (!container) return;
    const resultadoLabel = { producao: 'Produção', refugo: 'Refugo' };
    if (formulasWise.length === 0) {
      container.innerHTML = '<p style="font-size:0.8rem;color:var(--text-dim);text-align:center;padding:4px 0 8px;">Nenhuma fórmula configurada</p>';
    } else {
      container.innerHTML = formulasWise.map(f => {
        let ops = [];
        try { ops = JSON.parse(f.operacoes); } catch { }
        const expr = ops.map((o, i) => `${i > 0 ? (o.operacao === '-' ? ' − ' : ' + ') : ''}${o.posicao}`).join('');
        return `
          <div style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;">
            <span style="font-size:0.8rem;font-weight:600;color:var(--brand);min-width:64px;">${resultadoLabel[f.resultado] || f.resultado}</span>
            <span style="font-size:0.8rem;color:var(--text);flex:1;font-family:monospace;">${expr}</span>
            <button type="button" class="btn-del-formula" data-id="${f.id}"
              style="${BTN_DEL}" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--text-dim)'">×</button>
          </div>
        `;
      }).join('');
      container.querySelectorAll('.btn-del-formula').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await api.deletarWiseFormula(estadoConfig.linhaId, maquinaId, parseInt(btn.dataset.id));
            formulasWise = formulasWise.filter(f => f.id !== parseInt(btn.dataset.id));
            renderWiseFormulas();
            showToast('Fórmula removida');
          } catch { showToast('Erro ao remover fórmula', 'erro'); }
        });
      });
    }
  }

  document.getElementById('btn-wise-add-device')?.addEventListener('click', () => {
    abrirModalAdicionarDevice(maquinaId, async (novoDevice) => {
      devicesWise.push(novoDevice);
      renderWiseDevices();
    });
  });

  document.getElementById('btn-wise-add-formula')?.addEventListener('click', () => {
    const posicoes = [...new Set(devicesWise.map(d => d.posicao))];
    if (posicoes.length === 0) { showToast('Cadastre ao menos um dispositivo WISE antes de criar fórmulas', 'erro'); return; }
    abrirModalAdicionarFormula(maquinaId, posicoes, async (novaFormula) => {
      formulasWise = formulasWise.filter(f => f.resultado !== novaFormula.resultado);
      formulasWise.push(novaFormula);
      renderWiseFormulas();
    });
  });

  atualizarVisibilidade();

  // ── Salvar ────────────────────────────────────────────────
  document.getElementById('modal-maq-salvar').addEventListener('click', async () => {
    const velocidadeVal = document.getElementById('modal-maq-velocidade').value.trim() !== '' ? parseFloat(document.getElementById('modal-maq-velocidade').value) : null;
    const sobrevelocidadeVal = document.getElementById('modal-maq-sobrevelocidade').value.trim() !== '' ? parseFloat(document.getElementById('modal-maq-sobrevelocidade').value) : null;
    const multiplicadorVal = parseFloat(document.getElementById('modal-maq-multiplicador').value) || 1;

    if (!velocidadeVal) { document.getElementById('modal-maq-velocidade').style.borderColor = 'var(--red)'; showToast('Velocidade nominal e Sobrevelocidade são obrigatórios', 'erro'); return; }
    if (sobrevelocidadeVal === null) { document.getElementById('modal-maq-sobrevelocidade').style.borderColor = 'var(--red)'; showToast('Velocidade nominal e Sobrevelocidade são obrigatórios', 'erro'); return; }

    document.getElementById('modal-maq-velocidade').style.borderColor = '';
    document.getElementById('modal-maq-sobrevelocidade').style.borderColor = '';

    try {
      const dadosSalvar = {
        velocidade_nominal: velocidadeVal,
        sobrevelocidade: sobrevelocidadeVal,
        multiplicador_produto: multiplicadorVal,
        critica: criticaAtual,
        tem_refugo: temRefugoAtual,
        ...(tipoSelecionado === 'manual' && { alarmes: JSON.stringify(alarmesList) }),
      };
      await api.atualizarMaquina(estadoConfig.linhaId, maquinaId, dadosSalvar);
      const m = estadoConfig.maquinas.find(m => m.id === maquinaId);
      if (m) {
        Object.assign(m, {
          velocidade_nominal: velocidadeVal,
          sobrevelocidade: sobrevelocidadeVal,
          multiplicador_produto: multiplicadorVal,
          critica: criticaAtual,
          tem_refugo: temRefugoAtual,
        });
        if (tipoSelecionado === 'manual') m.alarmes = JSON.stringify(alarmesList);
        if (criticaAtual) estadoConfig.maquinas.forEach(maq => { if (maq.id !== maquinaId) maq.critica = false; });
      }
      modal.remove();
      renderMaquinas();
      showToast('Configuração salva');
    } catch (err) { showToast(err.message || 'Erro ao salvar', 'erro'); }
  });

  document.getElementById('modal-maq-cancelar').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ============================================================
// MODAL: ADICIONAR DEVICE WISE
// ============================================================

function abrirModalAdicionarDevice(maquinaId, onSave) {
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <h3>Novo dispositivo WISE</h3>
      <div class="form-group">
        <label>IP do dispositivo</label>
        <input type="text" id="new-wise-ip" class="input" placeholder="Ex: 192.168.1.100">
      </div>
      <div class="form-group">
        <label>Posição na linha</label>
        <input type="text" id="new-wise-posicao" class="input" placeholder="Ex: saida, inspetor, entrada">
        <p class="modal-sub" style="margin-top:4px;">Usado nas fórmulas de cálculo de produção.</p>
      </div>
      <div class="form-row">
        <div class="form-group flex-1">
          <label>Usuário</label>
          <input type="text" id="new-wise-usuario" class="input" value="root">
        </div>
        <div class="form-group flex-1">
          <label>Senha</label>
          <input type="password" id="new-wise-senha" class="input" placeholder="Senha do WISE">
        </div>
      </div>
      <div class="form-group">
        <label>Ordem</label>
        <input type="number" id="new-wise-ordem" class="input" value="1" min="1">
      </div>
      <button type="button" class="btn btn-primary btn-block" id="btn-salvar-wise-device">Adicionar</button>
      <button type="button" class="btn btn-outline btn-block" id="btn-cancelar-wise-device" style="margin-top:8px;">Cancelar</button>
    </div>
  `;
  document.body.appendChild(m);

  document.getElementById('btn-salvar-wise-device').addEventListener('click', async () => {
    const ip = document.getElementById('new-wise-ip').value.trim();
    const posicao = document.getElementById('new-wise-posicao').value.trim();
    const usuario = document.getElementById('new-wise-usuario').value.trim() || 'root';
    const senha = document.getElementById('new-wise-senha').value;
    const ordem = parseInt(document.getElementById('new-wise-ordem').value) || 1;
    if (!ip || !posicao) { showToast('IP e posição são obrigatórios', 'erro'); return; }
    try {
      const novo = await api.criarWiseDevice(estadoConfig.linhaId, maquinaId, { ip, posicao, usuario, senha, ordem, ativo: true });
      m.remove();
      onSave(novo);
      showToast('Dispositivo adicionado');
    } catch (err) { showToast(err.message || 'Erro ao adicionar dispositivo', 'erro'); }
  });

  document.getElementById('btn-cancelar-wise-device').addEventListener('click', () => m.remove());
  m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
}

// ============================================================
// MODAL: ADICIONAR FÓRMULA
// ============================================================

function abrirModalAdicionarFormula(maquinaId, posicoes, onSave) {
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <h3>Nova fórmula de cálculo</h3>
      <p class="modal-sub">Clique nas posições para montar a fórmula. Use o botão +/− para alternar a operação.</p>
      <div class="form-group">
        <label>Resultado</label>
        <select id="formula-resultado" class="input">
          <option value="producao">Produção</option>
          <option value="refugo">Refugo</option>
        </select>
      </div>
      <div class="form-group">
        <label>Posições disponíveis</label>
        <div id="formula-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;">
          ${posicoes.map(p => `
            <span class="formula-posicao-chip" data-posicao="${p}"
              style="background:var(--brand-bg);color:var(--brand);padding:4px 12px;border-radius:20px;font-size:0.8rem;font-weight:600;cursor:pointer;border:1px solid var(--brand);transition:opacity 0.15s;user-select:none;">
              ${p}
            </span>
          `).join('')}
        </div>
      </div>
      <div class="form-group">
        <label>Fórmula</label>
        <div id="formula-builder" style="min-height:48px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 10px;display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:var(--bg);">
          <span id="formula-placeholder" style="font-size:0.8rem;color:var(--text-dim);">Clique nas posições acima para montar a fórmula...</span>
        </div>
      </div>
      <p id="formula-preview" style="font-family:monospace;font-size:0.875rem;color:var(--text);text-align:center;min-height:20px;margin-bottom:12px;font-weight:600;"></p>
      <button type="button" class="btn btn-outline btn-block" id="btn-formula-limpar" style="margin-bottom:8px;">Limpar</button>
      <button type="button" class="btn btn-primary btn-block" id="btn-salvar-formula">Salvar fórmula</button>
      <button type="button" class="btn btn-outline btn-block" id="btn-cancelar-formula" style="margin-top:8px;">Cancelar</button>
    </div>
  `;
  document.body.appendChild(m);

  let operacoes = [];

  function atualizarBuilder() {
    const builder = document.getElementById('formula-builder');
    const placeholder = document.getElementById('formula-placeholder');
    const preview = document.getElementById('formula-preview');

    [...builder.children].forEach(c => { if (c.id !== 'formula-placeholder') c.remove(); });

    if (operacoes.length === 0) {
      placeholder.style.display = '';
      preview.textContent = '';
      return;
    }

    placeholder.style.display = 'none';

    operacoes.forEach((op, i) => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:flex;align-items:center;gap:3px;';

      if (i > 0) {
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = op.operacao;
        toggleBtn.style.cssText = `background:${op.operacao === '+' ? 'var(--green-dim)' : 'var(--red-dim)'};color:${op.operacao === '+' ? 'var(--green)' : 'var(--red)'};border:none;border-radius:4px;width:24px;height:24px;font-size:1rem;cursor:pointer;font-weight:700;line-height:1;flex-shrink:0;`;
        toggleBtn.addEventListener('click', () => {
          operacoes[i].operacao = operacoes[i].operacao === '+' ? '-' : '+';
          atualizarBuilder();
        });
        wrapper.appendChild(toggleBtn);
      }

      const chip = document.createElement('span');
      chip.textContent = op.posicao;
      chip.style.cssText = 'background:var(--brand-bg);color:var(--brand);padding:3px 10px;border-radius:12px;font-size:0.8rem;font-weight:600;border:1px solid var(--brand);';
      wrapper.appendChild(chip);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.style.cssText = 'background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1rem;padding:0 2px;line-height:1;';
      removeBtn.addEventListener('click', () => {
        operacoes.splice(i, 1);
        atualizarBuilder();
      });
      wrapper.appendChild(removeBtn);

      builder.appendChild(wrapper);
    });

    const expr = operacoes.map((o, i) => `${i > 0 ? ` ${o.operacao} ` : ''}${o.posicao}`).join('');
    preview.textContent = expr;
  }

  m.querySelectorAll('.formula-posicao-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      operacoes.push({ posicao: chip.dataset.posicao, operacao: '+' });
      atualizarBuilder();
    });
  });

  document.getElementById('btn-formula-limpar').addEventListener('click', () => {
    operacoes = [];
    atualizarBuilder();
  });

  document.getElementById('btn-salvar-formula').addEventListener('click', async () => {
    if (operacoes.length === 0) { showToast('Monte a fórmula antes de salvar', 'erro'); return; }
    const resultado = document.getElementById('formula-resultado').value;
    try {
      const nova = await api.salvarWiseFormula(estadoConfig.linhaId, maquinaId, { resultado, operacoes: JSON.stringify(operacoes) });
      m.remove();
      onSave(nova);
      showToast('Fórmula salva');
    } catch (err) { showToast(err.message || 'Erro ao salvar fórmula', 'erro'); }
  });

  document.getElementById('btn-cancelar-formula').addEventListener('click', () => m.remove());
  m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
}

// ============================================================
// SEÇÃO 4 — CONFIGURAÇÃO DA MEDIÇÃO
// ============================================================

function preencherConfigMedicao() {
  const cfg = store.config;
  document.getElementById('cfg-shift-start').value = cfg.shiftStart || '08:00';
  document.getElementById('cfg-shift-end').value = cfg.shiftEnd || '17:00';
}

function configurarBotaoSalvar() {
  const btn = document.getElementById('cfg-save-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    store.updateConfig({
      clienteId: estadoConfig.clienteId,
      linhaId: estadoConfig.linhaId,
      client: document.getElementById('cfg-cliente-select')?.selectedOptions[0]?.text || store.config.client || '',
      shiftStart: document.getElementById('cfg-shift-start').value,
      shiftEnd: document.getElementById('cfg-shift-end').value,
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
// GESTÃO DE USUÁRIOS
// ============================================================

function configurarBotaoUsuarios() {
  const btn = document.getElementById('cfg-usuarios-btn');
  if (!btn) return;
  const usuario = window.usuarioAtual;
  if (usuario?.nivel === 'admin') {
    btn.classList.remove('hidden');
    btn.style.display = 'flex';
  }
  btn.addEventListener('click', abrirModalUsuarios);
}

async function abrirModalUsuarios() {
  document.getElementById('modal-usuarios')?.remove();
  const modal = document.createElement('div');
  modal.id = 'modal-usuarios';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <h3>Gestão de usuários</h3>
      <p class="modal-sub">Cadastre e gerencie os acessos ao SmartLine</p>
      <div id="modal-usuarios-list" style="margin-bottom:20px;"></div>
      <p style="font-size:0.875rem;font-weight:600;color:var(--text);margin-bottom:12px;">Novo usuário</p>
      <div class="form-row">
        <div class="form-group flex-1"><label>Nome</label><input type="text" id="novo-usuario-nome" class="input" placeholder="Ex: João"></div>
        <div class="form-group flex-1"><label>Sobrenome</label><input type="text" id="novo-usuario-sobrenome" class="input" placeholder="Ex: Silva"></div>
      </div>
      <div class="form-group">
        <label>Usuário (gerado automaticamente)</label>
        <input type="text" id="novo-usuario-login" class="input" placeholder="nome.sobrenome" readonly style="color:var(--text-dim);background:var(--bg);cursor:default;">
      </div>
      <div class="form-group"><label>Senha</label><input type="password" id="novo-usuario-senha" class="input" placeholder="Mínimo 6 caracteres"></div>
      <div class="form-group">
        <label>Nível de acesso</label>
        <select id="novo-usuario-nivel" class="input">
          <option value="auditor">Auditor</option>
          <option value="cliente">Cliente</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <button type="button" class="btn btn-primary btn-block" id="btn-criar-usuario">Criar usuário</button>
      <button type="button" class="btn btn-outline btn-block" id="btn-fechar-usuarios" style="margin-top:8px;">Fechar</button>
    </div>
  `;
  document.body.appendChild(modal);

  const nomeInput = document.getElementById('novo-usuario-nome');
  const sobrenomeInput = document.getElementById('novo-usuario-sobrenome');
  const loginInput = document.getElementById('novo-usuario-login');

  function atualizarLogin() {
    const nome = nomeInput.value.trim().toLowerCase().replace(/\s+/g, '');
    const sobrenome = sobrenomeInput.value.trim().toLowerCase().replace(/\s+/g, '');
    loginInput.value = nome && sobrenome ? `${nome}.${sobrenome}` : nome || sobrenome || '';
  }
  nomeInput.addEventListener('input', atualizarLogin);
  sobrenomeInput.addEventListener('input', atualizarLogin);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.getElementById('btn-fechar-usuarios').addEventListener('click', () => modal.remove());

  document.getElementById('btn-criar-usuario').addEventListener('click', async () => {
    const nome = nomeInput.value.trim();
    const sobrenome = sobrenomeInput.value.trim();
    const login = loginInput.value.trim();
    const senha = document.getElementById('novo-usuario-senha').value;
    const nivel = document.getElementById('novo-usuario-nivel').value;
    if (!nome || !sobrenome) { showToast('Informe nome e sobrenome', 'erro'); return; }
    if (!senha || senha.length < 6) { showToast('Senha deve ter pelo menos 6 caracteres', 'erro'); return; }
    try {
      await api.criarUsuario({ nome: `${nome} ${sobrenome}`, login, senha, nivel });
      showToast('Usuário criado');
      nomeInput.value = ''; sobrenomeInput.value = ''; loginInput.value = '';
      document.getElementById('novo-usuario-senha').value = '';
      await renderListaUsuarios();
    } catch (err) { showToast(err.message || 'Erro ao criar usuário', 'erro'); }
  });

  await renderListaUsuarios();
}

async function renderListaUsuarios() {
  const list = document.getElementById('modal-usuarios-list');
  if (!list) return;
  try {
    const usuarios = await api.listarUsuarios();
    const usuarioAtual = window.usuarioAtual;
    if (usuarios.length === 0) {
      list.innerHTML = '<p style="font-size:0.8rem;color:var(--text-dim);text-align:center;padding:8px 0;">Nenhum usuário cadastrado</p>';
      return;
    }
    list.innerHTML = usuarios.map(u => `
      <div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="flex:1;">
          <div style="font-size:0.875rem;font-weight:600;color:var(--text);">${u.nome}</div>
          <div style="font-size:0.75rem;color:var(--text-dim);">${u.login} · ${u.nivel}</div>
        </div>
        ${u.id !== usuarioAtual?.id ? `
          <button type="button" class="btn-reset-senha" data-id="${u.id}" title="Redefinir senha" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:1rem;padding:4px;">🔑</button>
          <button type="button" class="btn-deletar-usuario" data-id="${u.id}" title="Remover" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:1.25rem;padding:4px;">×</button>
        ` : '<span style="font-size:0.7rem;color:var(--brand);font-weight:600;padding:4px;">você</span>'}
      </div>
    `).join('');
    list.querySelectorAll('.btn-deletar-usuario').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remover este usuário?')) return;
        try { await api.deletarUsuario(parseInt(btn.dataset.id)); showToast('Usuário removido'); await renderListaUsuarios(); }
        catch (err) { showToast(err.message || 'Erro ao remover', 'erro'); }
      });
    });
    list.querySelectorAll('.btn-reset-senha').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nova = prompt('Nova senha (mínimo 6 caracteres):');
        if (!nova || nova.length < 6) { showToast('Senha muito curta', 'erro'); return; }
        try { await api.alterarSenha(parseInt(btn.dataset.id), nova); showToast('Senha alterada'); }
        catch (err) { showToast(err.message || 'Erro ao alterar senha', 'erro'); }
      });
    });
  } catch {
    list.innerHTML = '<p style="font-size:0.8rem;color:var(--red);">Erro ao carregar usuários</p>';
  }
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