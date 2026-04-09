// ============================================================
// CONFIG.JS — Tela de configuração
// Seções: Cliente, Linha, Fluxo da linha,
// Configuração da medição (turno, intervalo de produção)
// Gestão de usuários (somente admin)
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
    configurarBotaoUsuarios();
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

// Reseta o select de linhas e oculta a seção.
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

function abrirModalConfigMaquina(maquinaId, nome, velocidade, sobrevelocidade, multiplicador = 1, critica = false, alarmes) {
  document.getElementById('modal-config-maquina')?.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-config-maquina';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <h3>${nome}</h3>
      <p class="modal-sub">Configuração específica desta máquina</p>

      <div class="form-group">
        <label>Velocidade nominal (unidades/hora) <span style="color:var(--red)">*</span></label>
        <input type="number" id="modal-maq-velocidade" class="input" placeholder="Ex: 12000" value="${velocidade}" inputmode="numeric">
        <p class="modal-sub" style="margin-top:4px;">Velocidade de operação padrão da máquina.</p>
      </div>

      <div class="form-group">
        <label>Sobrevelocidade (% acima da nominal)</label>
        <input type="number" step="0.1" min="0" id="modal-maq-sobrevelocidade" class="input" placeholder="Ex: 10 (significa 10% acima)" value="${sobrevelocidade}" inputmode="numeric">
        <p class="modal-sub" style="margin-top:4px;">Velocidade máxima para compensar paradas na linha.</p>
      </div>

      <div class="form-group">
        <label>Multiplicador de produto</label>
        <input type="number" step="0.01" min="0.01" id="modal-maq-multiplicador" class="input" placeholder="Ex: 24 (garrafas por caixa)" value="${multiplicador}">
        <p class="modal-sub" style="margin-top:4px;">Aplicado sobre a velocidade para cálculo de unidades finais.</p>
      </div>

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

  let criticaAtual = critica;
  const toggle = document.getElementById('modal-maq-critica-toggle');
  const label = document.getElementById('modal-maq-critica-label');

  toggle.addEventListener('click', () => {
    criticaAtual = !criticaAtual;
    toggle.classList.toggle('active', criticaAtual);
    label.textContent = criticaAtual ? 'Sim' : 'Não';
  });

  let alarmesList = [...alarmes];

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

function preencherConfigMedicao() {
  const cfg = store.config;
  document.getElementById('cfg-shift-start').value = cfg.shiftStart || '08:00';
  document.getElementById('cfg-shift-end').value = cfg.shiftEnd || '17:00';
  document.getElementById('cfg-prod-interval').value = cfg.productionInterval || 30;
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
// GESTÃO DE USUÁRIOS — visível apenas para admin
// ============================================================

// Exibe o botão de usuários no header somente para admin e configura o listener.
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

// Abre o modal de gestão de usuários com lista e formulário de criação.
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
        <div class="form-group flex-1">
          <label>Nome</label>
          <input type="text" id="novo-usuario-nome" class="input" placeholder="Ex: João">
        </div>
        <div class="form-group flex-1">
          <label>Sobrenome</label>
          <input type="text" id="novo-usuario-sobrenome" class="input" placeholder="Ex: Silva">
        </div>
      </div>
      <div class="form-group">
        <label>Usuário (gerado automaticamente)</label>
        <input type="text" id="novo-usuario-login" class="input" placeholder="nome.sobrenome" readonly
          style="color:var(--text-dim);background:var(--bg);cursor:default;">
      </div>
      <div class="form-group">
        <label>Senha</label>
        <input type="password" id="novo-usuario-senha" class="input" placeholder="Mínimo 6 caracteres">
      </div>
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

  // Gera login automaticamente ao digitar nome ou sobrenome
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

  // Fecha ao clicar no overlay ou no botão fechar
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.getElementById('btn-fechar-usuarios').addEventListener('click', () => modal.remove());

  // Cria novo usuário
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
      nomeInput.value = '';
      sobrenomeInput.value = '';
      loginInput.value = '';
      document.getElementById('novo-usuario-senha').value = '';
      await renderListaUsuarios();
    } catch (err) {
      showToast(err.message || 'Erro ao criar usuário', 'erro');
    }
  });

  await renderListaUsuarios();
}

// Renderiza a lista de usuários com opções de deletar e redefinir senha.
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
          <button type="button" class="btn-reset-senha" data-id="${u.id}" title="Redefinir senha"
            style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:1rem;padding:4px;">🔑</button>
          <button type="button" class="btn-deletar-usuario" data-id="${u.id}" title="Remover"
            style="background:none;border:none;cursor:pointer;color:var(--red);font-size:1.25rem;padding:4px;">×</button>
        ` : '<span style="font-size:0.7rem;color:var(--brand);font-weight:600;padding:4px;">você</span>'}
      </div>
    `).join('');

    // Deletar usuário
    list.querySelectorAll('.btn-deletar-usuario').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remover este usuário?')) return;
        try {
          await api.deletarUsuario(parseInt(btn.dataset.id));
          showToast('Usuário removido');
          await renderListaUsuarios();
        } catch (err) {
          showToast(err.message || 'Erro ao remover', 'erro');
        }
      });
    });

    // Redefinir senha
    list.querySelectorAll('.btn-reset-senha').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nova = prompt('Nova senha (mínimo 6 caracteres):');
        if (!nova || nova.length < 6) { showToast('Senha muito curta', 'erro'); return; }
        try {
          await api.alterarSenha(parseInt(btn.dataset.id), nova);
          showToast('Senha alterada');
        } catch (err) {
          showToast(err.message || 'Erro ao alterar senha', 'erro');
        }
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