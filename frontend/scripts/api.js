// ============================================================
// API.JS — Camada de comunicação com o backend
// Centraliza todas as chamadas fetch à API do SmartLine
// ============================================================

const BASE_URL = 'http://127.0.0.1:5000';

// Função genérica de requisição HTTP. Serializa o body em JSON e
// lança um erro com a mensagem do backend em caso de resposta não-ok.
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

export const api = {

  // ── Clientes ──────────────────────────────────────────────

  // Retorna todos os clientes cadastrados no sistema.
  async listarClientes() {
    return request('GET', '/clientes/');
  },

  // Cria um novo cliente com o nome informado.
  async criarCliente(nome) {
    return request('POST', '/clientes/', { nome });
  },

  // ── Linhas ────────────────────────────────────────────────

  // Retorna as linhas de produção de um cliente específico.
  async listarLinhas(clienteId) {
    return request('GET', `/linhas/?cliente_id=${clienteId}`);
  },

  // Cria uma nova linha de produção vinculada ao cliente informado.
  async criarLinha(nome, clienteId) {
    return request('POST', '/linhas/', { nome, cliente_id: clienteId });
  },

  // Retorna o status em tempo real de cada máquina da linha
  // (estado, eficiência, produção, tempo parado, MTBF, MTTR).
  async statusLinha(linhaId) {
    return request('GET', `/linhas/${linhaId}/status`);
  },

  // Retorna os dados agregados da linha para o Dashboard:
  // produção e OEE da máquina crítica, eficiência média, paradas, MTBF e MTTR.
  async dashboardLinha(linhaId) {
    return request('GET', `/linhas/${linhaId}/dashboard`);
  },

  // ── Máquinas da linha ────────────────────────────────────

  // Retorna todas as máquinas de uma linha ordenadas por ordem de sequência.
  async listarMaquinas(linhaId) {
    return request('GET', `/linhas/${linhaId}/maquinas/`);
  },

  // Cria uma nova máquina na linha com nome e posição na sequência.
  async criarMaquina(linhaId, nome, ordem) {
    return request('POST', `/linhas/${linhaId}/maquinas/`, { nome, ordem, linha_id: linhaId });
  },

  // Remove uma máquina da linha pelo ID.
  async deletarMaquina(linhaId, maquinaId) {
    return request('DELETE', `/linhas/${linhaId}/maquinas/${maquinaId}`);
  },

  // Atualiza campos de uma máquina (nome, ordem, velocidade, alarmes, crítica, multiplicador).
  async atualizarMaquina(linhaId, maquinaId, dados) {
    return request('PATCH', `/linhas/${linhaId}/maquinas/${maquinaId}`, dados);
  },

  // Retorna apenas as máquinas sem medição ativa — usadas no modal de início de medição.
  async listarMaquinasDisponiveis(linhaId) {
    return request('GET', `/linhas/${linhaId}/maquinas/disponiveis`);
  },

  // ── Medições ─────────────────────────────────────────────

  // Cria uma nova medição com os dados do auditor (cliente, máquina, turno, produção inicial).
  async criarMedicao(dados) {
    return request('POST', '/medicoes/', dados);
  },

  // Registra um evento na medição ativa (marcha ou parada), com motivo e leitura de produção opcionais.
  async registrarEvento(medicaoId, tipo, motivo = null, producaoLeitura = null) {
    return request('POST', `/medicoes/${medicaoId}/eventos/`, {
      tipo,
      motivo,
      producao_leitura: producaoLeitura,
    });
  },

  // Finaliza uma medição informando a produção final. Define o timestamp_fim no backend.
  async finalizarMedicao(medicaoId, producaoFinal) {
    return request('PATCH', `/medicoes/${medicaoId}/finalizar`, {
      producao_final: producaoFinal,
    });
  },

  // Retorna todas as medições de uma linha. Atalho sem filtros adicionais.
  async listarMedicoesDaLinha(linhaId) {
    return request('GET', `/medicoes/?linha_id=${linhaId}`);
  },

  // Retorna medições com filtros opcionais: linha, máquina, cliente, turno e intervalo de datas.
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

  // Busca uma medição específica pelo ID.
  async getMedicao(id) {
    return request('GET', `/medicoes/${id}`);
  },

  // Retorna a medição ativa de uma máquina e seus eventos.
  async medicaoAtiva(maquinaLinhaId) {
    return request('GET', `/medicoes/ativa?maquina_linha_id=${maquinaLinhaId}`);
  },

  // ── Filtros ──────────────────────────────────────────────

  // Retorna os valores disponíveis para filtros no overview:
  // lista de clientes, turnos e datas com medições registradas na linha.
  async filtrosDisponiveis(linhaId) {
    return request('GET', `/medicoes/filtros-disponiveis?linha_id=${linhaId}`);
  },

};