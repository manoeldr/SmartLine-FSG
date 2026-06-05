// ============================================================
// API.JS — Camada de comunicação com o backend
// ============================================================

const BASE_URL = `http://${window.location.hostname}:5000`;

async function request(method, path, body = null) {
  const token = sessionStorage.getItem('smartline_token');
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const r = await fetch(`${BASE_URL}${path}`, opts);
    if (r.status === 401) {
      sessionStorage.removeItem('smartline_token');
      sessionStorage.removeItem('smartline_usuario');
      window.dispatchEvent(new CustomEvent('auth:logout'));
      throw new Error('Sessão expirada');
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ${r.status}`);
    }
    return await r.json();
  } catch (e) {
    throw e;
  }
}

export const api = {

  // ── Autenticação ──────────────────────────────────────────

  async login(login, senha) {
    const r = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, senha }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || 'Login ou senha incorretos');
    }
    return r.json();
  },

  async me() {
    const token = sessionStorage.getItem('smartline_token');
    const r = await fetch(`${BASE_URL}/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!r.ok) throw new Error('Token inválido');
    return r.json();
  },

  // ── Usuários ──────────────────────────────────────────────

  async listarUsuarios() { return request('GET', '/auth/usuarios'); },
  async criarUsuario(dados) { return request('POST', '/auth/usuarios', dados); },
  async deletarUsuario(id) { return request('DELETE', `/auth/usuarios/${id}`); },
  async alterarSenha(id, novaSenha) {
    return request('PATCH', `/auth/usuarios/${id}/senha?nova_senha=${encodeURIComponent(novaSenha)}`);
  },

  // ── Clientes ──────────────────────────────────────────────

  async listarClientes() { return request('GET', '/clientes/'); },
  async criarCliente(nome) { return request('POST', '/clientes/', { nome }); },

  // ── Linhas ────────────────────────────────────────────────

  async listarLinhas(clienteId) { return request('GET', `/linhas/?cliente_id=${clienteId}`); },
  async criarLinha(nome, clienteId) { return request('POST', '/linhas/', { nome, cliente_id: clienteId }); },
  async statusLinha(linhaId) { return request('GET', `/linhas/${linhaId}/status`); },
  async dashboardLinha(linhaId) { return request('GET', `/linhas/${linhaId}/dashboard`); },

  // ── Máquinas da linha ─────────────────────────────────────

  async listarMaquinas(linhaId) { return request('GET', `/linhas/${linhaId}/maquinas/`); },
  async criarMaquina(linhaId, nome, ordem) {
    return request('POST', `/linhas/${linhaId}/maquinas/`, { nome, ordem, linha_id: linhaId });
  },
  async deletarMaquina(linhaId, maquinaId) {
    return request('DELETE', `/linhas/${linhaId}/maquinas/${maquinaId}`);
  },
  async atualizarMaquina(linhaId, maquinaId, dados) {
    return request('PATCH', `/linhas/${linhaId}/maquinas/${maquinaId}`, dados);
  },
  async listarMaquinasDisponiveis(linhaId) {
    return request('GET', `/linhas/${linhaId}/maquinas/disponiveis`);
  },
  async ocupacaoMaquinas(linhaId) {
    return request('GET', `/linhas/${linhaId}/maquinas/ocupacao`);
  },

  // ── Medições ─────────────────────────────────────────────

  async criarMedicao(dados) { return request('POST', '/medicoes/', dados); },

  // Registra um evento na medição ativa.
  // categoria: "Interna" ou "Externa" — relevante para eventos de parada.
  // Paradas Internas penalizam o OEE; Externas são registradas mas não penalizam.
  async registrarEvento(medicaoId, tipo, motivo = null, producaoLeitura = null, refugoLeitura = null, categoria = null) {
    return request('POST', `/medicoes/${medicaoId}/eventos/`, {
      tipo,
      motivo,
      categoria,
      producao_leitura: producaoLeitura,
      refugo_leitura: refugoLeitura,
    });
  },

  // Atualiza o motivo de um evento de parada.
  async atualizarMotivoEvento(medicaoId, eventoId, motivo) {
    return request('PATCH', `/medicoes/${medicaoId}/eventos/${eventoId}/motivo?motivo=${encodeURIComponent(motivo)}`);
  },

  // Atualiza a categoria de um evento de parada (Interna ou Externa).
  // Usado pelo auditor/admin para corrigir a classificação após o registro.
  async atualizarCategoriaEvento(medicaoId, eventoId, categoria) {
    return request('PATCH', `/medicoes/${medicaoId}/eventos/${eventoId}/categoria`, { categoria });
  },

  async finalizarMedicao(medicaoId, producaoFinal) {
    return request('PATCH', `/medicoes/${medicaoId}/finalizar`, { producao_final: producaoFinal });
  },

  async listarMedicoesDaLinha(linhaId) {
    return request('GET', `/medicoes/?linha_id=${linhaId}`);
  },

  async listarMedicoes(filtros = {}) {
    const params = new URLSearchParams();
    if (filtros.linhaId) params.append('linha_id', filtros.linhaId);
    if (filtros.maquinaLinhaId) params.append('maquina_linha_id', filtros.maquinaLinhaId);
    if (filtros.cliente) params.append('cliente', filtros.cliente);
    if (filtros.turnoInicio) params.append('turno_inicio', filtros.turnoInicio);
    if (filtros.dataInicio) params.append('data_inicio', filtros.dataInicio);
    if (filtros.dataFim) params.append('data_fim', filtros.dataFim);
    return request('GET', `/medicoes/?${params.toString()}`);
  },

  async getMedicao(id) { return request('GET', `/medicoes/${id}`); },

  async indicadoresMedicao(medicaoId) {
    return request('GET', `/medicoes/${medicaoId}/indicadores`);
  },

  async medicaoAtiva(maquinaLinhaId) {
    return request('GET', `/medicoes/ativa?maquina_linha_id=${maquinaLinhaId}`);
  },

  // ── Fotos de eventos ──────────────────────────────────────

  async uploadFotoEvento(medicaoId, eventoId, file) {
    const token = sessionStorage.getItem('smartline_token');
    const formData = new FormData();
    formData.append('foto', file);
    const r = await fetch(`${BASE_URL}/medicoes/${medicaoId}/eventos/${eventoId}/foto`, {
      method: 'POST',
      headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: formData,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ${r.status}`);
    }
    return r.json();
  },

  fotoEventoUrl(medicaoId, eventoId) {
    return `${BASE_URL}/medicoes/${medicaoId}/eventos/${eventoId}/foto`;
  },

  // ── Filtros ───────────────────────────────────────────────

  async filtrosDisponiveis(linhaId) {
    return request('GET', `/medicoes/filtros-disponiveis?linha_id=${linhaId}`);
  },

  // ── WISE — Devices ────────────────────────────────────────

  async listarWiseDevices(linhaId, maquinaId) {
    return request('GET', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/`);
  },
  async criarWiseDevice(linhaId, maquinaId, dados) {
    return request('POST', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/`, dados);
  },
  async atualizarWiseDevice(linhaId, maquinaId, deviceId, dados) {
    return request('PATCH', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/${deviceId}`, dados);
  },
  async deletarWiseDevice(linhaId, maquinaId, deviceId) {
    return request('DELETE', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/${deviceId}`);
  },
  async pingWiseDevice(linhaId, maquinaId, deviceId) {
    return request('GET', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/${deviceId}/ping`);
  },

  // ── WISE — Channels ───────────────────────────────────────

  async listarWiseChannels(linhaId, maquinaId, deviceId) {
    return request('GET', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/${deviceId}/channels/`);
  },
  async criarWiseChannel(linhaId, maquinaId, deviceId, dados) {
    return request('POST', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/${deviceId}/channels/`, dados);
  },
  async atualizarWiseChannel(linhaId, maquinaId, deviceId, channelId, dados) {
    return request('PATCH', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/${deviceId}/channels/${channelId}`, dados);
  },
  async deletarWiseChannel(linhaId, maquinaId, deviceId, channelId) {
    return request('DELETE', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/${deviceId}/channels/${channelId}`);
  },

  // ── WISE — Formulas ───────────────────────────────────────

  async listarWiseFormulas(linhaId, maquinaId) {
    return request('GET', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/formulas/`);
  },
  async salvarWiseFormula(linhaId, maquinaId, dados) {
    return request('POST', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/formulas/`, dados);
  },
  async atualizarWiseFormula(linhaId, maquinaId, formulaId, dados) {
    return request('PATCH', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/formulas/${formulaId}`, dados);
  },
  async deletarWiseFormula(linhaId, maquinaId, formulaId) {
    return request('DELETE', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/formulas/${formulaId}`);
  },
};