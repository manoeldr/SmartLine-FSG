// ============================================================
// API.JS — Camada de comunicação com o backend
// Centraliza todas as chamadas fetch à API do SmartLine
// ============================================================

const BASE_URL = 'http://127.0.0.1:5000';

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const r = await fetch(`${BASE_URL}${path}`, opts);
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ${r.status}`);
    }
    return await r.json();
  } catch (e) {
    throw e;
  }
}

// ── Clientes ──────────────────────────────────────────────
export const api = {
  async listarClientes() {
    return request('GET', '/clientes/');
  },

  async criarCliente(nome) {
    return request('POST', '/clientes/', { nome });
  },

  // ── Linhas ──────────────────────────────────────────────
  async listarLinhas(clienteId) {
    return request('GET', `/linhas/?cliente_id=${clienteId}`);
  },

  async criarLinha(nome, clienteId) {
    return request('POST', '/linhas/', { nome, cliente_id: clienteId });
  },

  async statusLinha(linhaId) {
    return request('GET', `/linhas/${linhaId}/status`);
},

  // ── Máquinas da linha ────────────────────────────────────
  async listarMaquinas(linhaId) {
    return request('GET', `/linhas/${linhaId}/maquinas/`);
  },

  async criarMaquina(linhaId, nome, ordem) {
    return request('POST', `/linhas/${linhaId}/maquinas/`, { nome, ordem, linha_id: linhaId });
  },

  async deletarMaquina(linhaId, maquinaId) {
    return request('DELETE', `/linhas/${linhaId}/maquinas/${maquinaId}`);
  },

  async atualizarMaquina(linhaId, maquinaId, dados) {
    return request('PATCH', `/linhas/${linhaId}/maquinas/${maquinaId}`, dados);
  },
  
  // ── Medições ─────────────────────────────────────────────
  async criarMedicao(dados) {
    return request('POST', '/medicoes/', dados);
  },

  async registrarEvento(medicaoId, tipo, motivo = null, producaoLeitura = null) {
    return request('POST', `/medicoes/${medicaoId}/eventos/`, {
      tipo,
      motivo,
      producao_leitura: producaoLeitura,
    });
  },

  async finalizarMedicao(medicaoId, producaoFinal) {
    return request('PATCH', `/medicoes/${medicaoId}/finalizar`, {
      producao_final: producaoFinal,
    });
  },

  async listarMedicoesDaLinha(linhaId) {
    return request('GET', `/medicoes/?linha_id=${linhaId}`);
  },

  async listarMaquinasDisponiveis(linhaId) {
    console.log('listarMaquinasDisponiveis chamado com linhaId:', linhaId);
    return request('GET', `/linhas/${linhaId}/maquinas/disponiveis`);
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

  async getMedicao(id) {
    return request('GET', `/medicoes/${id}`);
  },

  // ── Filtros ──────────────────────────────────────────────
  async filtrosDisponiveis(linhaId) {
    return request('GET', `/medicoes/filtros-disponiveis?linha_id=${linhaId}`);
  },

};

