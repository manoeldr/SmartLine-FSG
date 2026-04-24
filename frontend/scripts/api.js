// ============================================================
// API.JS — Camada de comunicação com o backend
// Centraliza todas as chamadas fetch à API do SmartLine.
// O token JWT é lido do sessionStorage e enviado em todas as requisições.
// ============================================================

const BASE_URL = `http://${window.location.hostname}:5000`;
// Swagger URL - http://192.168.137.1:5000/docs

// Função genérica de requisição HTTP.
// Injeta automaticamente o token JWT do sessionStorage no header Authorization.
// Lança erro 401 se o token estiver ausente ou inválido — o main.js redireciona para o login.
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

  // Realiza o login com login e senha. Não requer token.
  // Retorna { token, usuario } em caso de sucesso.
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

  // Verifica se o token atual ainda é válido e retorna os dados do usuário.
  // Usado ao recarregar a página para restaurar a sessão.
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

  // ── Usuários (somente admin) ──────────────────────────────

  // Lista todos os usuários cadastrados.
  async listarUsuarios() {
    return request('GET', '/auth/usuarios');
  },

  // Cria um novo usuário com nome, login, senha e nível.
  async criarUsuario(dados) {
    return request('POST', '/auth/usuarios', dados);
  },

  // Remove um usuário pelo ID.
  async deletarUsuario(id) {
    return request('DELETE', `/auth/usuarios/${id}`);
  },

  // Altera a senha de um usuário.
  async alterarSenha(id, novaSenha) {
    return request('PATCH', `/auth/usuarios/${id}/senha?nova_senha=${encodeURIComponent(novaSenha)}`);
  },

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

  // Retorna os dados agregados da linha para o Dashboard.
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

  // Registra um evento na medição ativa (marcha, parada ou produção).
  async registrarEvento(medicaoId, tipo, motivo = null, producaoLeitura = null) {
    return request('POST', `/medicoes/${medicaoId}/eventos/`, {
      tipo,
      motivo,
      producao_leitura: producaoLeitura,
    });
  },

  // Atualiza o motivo de um evento de parada específico.
  async atualizarMotivoEvento(medicaoId, eventoId, motivo) {
    return request('PATCH', `/medicoes/${medicaoId}/eventos/${eventoId}/motivo?motivo=${encodeURIComponent(motivo)}`);
  },

  // Finaliza uma medição informando a produção final.
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

  // Busca uma medição específica pelo ID, incluindo todos os eventos.
  async getMedicao(id) {
    return request('GET', `/medicoes/${id}`);
  },

  // Busca os indicadores calculados pelo backend para uma medição.
  // OEE, MTBF, MTTR, disponibilidade, performance e paradas por motivo.
  async indicadoresMedicao(medicaoId) {
    return request('GET', `/medicoes/${medicaoId}/indicadores`);
  },

  // Retorna a medição ativa de uma máquina e seus eventos.
  async medicaoAtiva(maquinaLinhaId) {
    return request('GET', `/medicoes/ativa?maquina_linha_id=${maquinaLinhaId}`);
  },

  // Retorna todas as máquinas com status de ocupação e nome do auditor.
  async ocupacaoMaquinas(linhaId) {
    return request('GET', `/linhas/${linhaId}/maquinas/ocupacao`);
  },

  // ── Fotos de eventos ─────────────────────────────────────

  // Envia uma foto para o backend vinculada a um evento de parada.
  // A imagem é comprimida para PNG pelo backend (Pillow).
  async uploadFotoEvento(medicaoId, eventoId, file) {
    const token = sessionStorage.getItem('smartline_token');
    const formData = new FormData();
    formData.append('foto', file);
    const r = await fetch(`${BASE_URL}/medicoes/${medicaoId}/eventos/${eventoId}/foto`, {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ${r.status}`);
    }
    return r.json();
  },

  // Retorna a URL da foto de um evento para exibição direta no frontend.
  fotoEventoUrl(medicaoId, eventoId) {
    return `${BASE_URL}/medicoes/${medicaoId}/eventos/${eventoId}/foto`;
  },

  // ── Filtros ──────────────────────────────────────────────

  // Retorna os valores disponíveis para filtros no overview.
  async filtrosDisponiveis(linhaId) {
    return request('GET', `/medicoes/filtros-disponiveis?linha_id=${linhaId}`);
  },

  // ── WISE — Devices ────────────────────────────────────────

  // Retorna todos os dispositivos WISE de uma máquina.
  async listarWiseDevices(linhaId, maquinaId) {
    return request('GET', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/`);
  },

  // Cadastra um novo dispositivo WISE numa máquina.
  async criarWiseDevice(linhaId, maquinaId, dados) {
    return request('POST', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/`, dados);
  },

  // Atualiza dados de um dispositivo WISE (IP, posição, ordem, credenciais).
  async atualizarWiseDevice(linhaId, maquinaId, deviceId, dados) {
    return request('PATCH', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/${deviceId}`, dados);
  },

  // Remove um dispositivo WISE e todos os seus canais.
  async deletarWiseDevice(linhaId, maquinaId, deviceId) {
    return request('DELETE', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/${deviceId}`);
  },

  // Testa conectividade com o WISE — retorna ok e lista de canais lidos.
  async pingWiseDevice(linhaId, maquinaId, deviceId) {
    return request('GET', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/${deviceId}/ping`);
  },

  // ── WISE — Channels ───────────────────────────────────────

  // Retorna todos os canais configurados num dispositivo WISE.
  async listarWiseChannels(linhaId, maquinaId, deviceId) {
    return request('GET', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/${deviceId}/channels/`);
  },

  // Cadastra um canal num dispositivo WISE.
  async criarWiseChannel(linhaId, maquinaId, deviceId, dados) {
    return request('POST', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/${deviceId}/channels/`, dados);
  },

  // Atualiza configuração de um canal WISE.
  async atualizarWiseChannel(linhaId, maquinaId, deviceId, channelId, dados) {
    return request('PATCH', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/${deviceId}/channels/${channelId}`, dados);
  },

  // Remove um canal de um dispositivo WISE.
  async deletarWiseChannel(linhaId, maquinaId, deviceId, channelId) {
    return request('DELETE', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/devices/${deviceId}/channels/${channelId}`);
  },

  // ── WISE — Formulas ───────────────────────────────────────

  // Retorna todas as fórmulas configuradas para uma máquina.
  async listarWiseFormulas(linhaId, maquinaId) {
    return request('GET', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/formulas/`);
  },

  // Cria ou substitui uma fórmula para um tipo de resultado (producao, refugo).
  async salvarWiseFormula(linhaId, maquinaId, dados) {
    return request('POST', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/formulas/`, dados);
  },

  // Atualiza as operações de uma fórmula existente.
  async atualizarWiseFormula(linhaId, maquinaId, formulaId, dados) {
    return request('PATCH', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/formulas/${formulaId}`, dados);
  },

  // Remove uma fórmula.
  async deletarWiseFormula(linhaId, maquinaId, formulaId) {
    return request('DELETE', `/linhas/${linhaId}/maquinas/${maquinaId}/wise/formulas/${formulaId}`);
  },
};