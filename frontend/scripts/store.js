// ============================================================
// STORE.JS — Camada de dados e persistência
// Responsável por salvar/carregar dados no localStorage,
// gerenciar estado da medição, alarmes, produção e paradas.
// Todas as outras telas consultam o store pra ler/escrever dados.
// ============================================================

// Chave usada no localStorage do navegador
const STORAGE_KEY = 'bottleline_data';

// Estrutura padrão dos dados — usada na primeira execução
// ou quando o localStorage está corrompido
const defaultData = () => ({
  config: {
    client: '',           // Nome da empresa cliente
    machine: '',          // Nome da máquina sendo medida
    speed: 0,             // Velocidade nominal em unidades/hora
    shiftStart: '08:00',  // Horário de início do turno
    shiftEnd: '17:00',    // Horário de fim do turno (dispara alerta)
    alarmCategories: ['Interna', 'Externa'],  // Categorias disponíveis para alarmes
    alarms: [
      // Cada alarme tem nome e categoria (Interna = falha da máquina, Externa = causa externa)
      { name: 'Falha no sensor', category: 'Interna' },
      { name: 'Falta de material', category: 'Externa' },
      { name: 'Ajuste mecânico', category: 'Interna' },
      { name: 'Troca de formato', category: 'Interna' },
      { name: 'Manutenção preventiva', category: 'Interna' },
      { name: 'Falta de energia', category: 'Externa' },
    ],
    productionInterval: 30,  // Intervalo em minutos pra solicitar leitura de produção
    theme: 'dark',           // Tema visual: 'dark' ou 'light'
  },
  measurement: {
    active: false,            // Se existe uma medição em andamento
    started: false,           // Se o usuário já informou produção inicial e clicou "Iniciar"
    state: 'idle',            // Estado atual: 'idle' | 'running' | 'stopped' | 'finished'
    startTime: null,          // ISO timestamp do início da medição
    endTime: null,            // ISO timestamp do fim (preenchido ao finalizar)
    shiftEndPrompted: false,  // Se já mostrou o alerta de fim de turno
    events: [],               // Array de eventos: { type, time, reason?, category?, value? }
                              // Tipos: 'start', 'stop', 'marcha', 'production', 'end'
    initialProduction: null,  // Valor do contador no início da medição
    productionReadings: [],   // Leituras periódicas: [{ time: ISO, value: number }]
    lastProductionPrompt: null, // Timestamp da última vez que pediu leitura de produção
  },
});

// ============================================================
// API.JS — Camada de comunicação com o backend
// ============================================================

const API_URL = `http://${window.location.hostname}:8000`;

const api = {
  async criarMedicao(config, producaoInicial) {
    try {
      const r = await fetch(`${API_URL}/medicoes/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente: config.client,
          maquina: config.machine,
          turno_inicio: config.shiftStart,
          turno_fim: config.shiftEnd,
          velocidade_nominal: config.speed,
          producao_inicial: producaoInicial,
        }),
      });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  },

  async registrarEvento(medicaoId, tipo, motivo = null, producaoLeitura = null) {
    try {
      await fetch(`${API_URL}/medicoes/${medicaoId}/eventos/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, motivo, producao_leitura: producaoLeitura }),
      });
    } catch { /* falha silenciosa — não quebra o front */ }
  },

  async finalizarMedicao(medicaoId, producaoFinal) {
    try {
      await fetch(`${API_URL}/medicoes/${medicaoId}/finalizar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producao_final: producaoFinal }),
      });
    } catch { /* falha silenciosa */ }
  },
};

export const store = {
  _data: null, // Objeto de dados em memória

  // Inicializa o store: carrega do localStorage ou cria dados padrão
  // Também faz migração de dados antigos (alarmes string → objeto)
  init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        this._data = JSON.parse(saved);
        const def = defaultData();

        // Garante que as chaves principais existem (proteção contra dados parciais)
        if (!this._data.config) this._data.config = def.config;
        if (!this._data.measurement) this._data.measurement = def.measurement;

        // Migração: versão antiga usava alarms como array de strings
        // Nova versão usa objetos { name, category }
        if (this._data.config.alarms && this._data.config.alarms.length > 0 && typeof this._data.config.alarms[0] === 'string') {
          this._data.config.alarms = this._data.config.alarms.map(a => ({ name: a, category: 'Interna' }));
        }

        // Garante campos adicionados em versões posteriores
        if (!this._data.config.alarmCategories) this._data.config.alarmCategories = def.config.alarmCategories;
        if (!this._data.config.theme) this._data.config.theme = def.config.theme;
        if (!this._data.config.productionInterval) this._data.config.productionInterval = def.config.productionInterval;
      } catch {
        // Se JSON está corrompido, reseta tudo
        this._data = defaultData();
      }
    } else {
      this._data = defaultData();
    }
    this.save();
  },

  // Persiste os dados no localStorage
  save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data)); },

  // Atalhos pra acessar config e measurement
  get config() { return this._data.config; },
  get measurement() { return this._data.measurement; },

  // Atualiza parcialmente a configuração (merge com dados existentes)
  updateConfig(partial) { Object.assign(this._data.config, partial); this.save(); },

  // Adiciona um alarme à lista (evita duplicados por nome)
  addAlarm(name, category) {
    if (name && !this._data.config.alarms.find(a => a.name === name)) {
      this._data.config.alarms.push({ name, category: category || 'Interna' });
      this.save();
    }
  },

  // Remove alarme pelo índice no array
  removeAlarm(index) { this._data.config.alarms.splice(index, 1); this.save(); },

  // Adiciona nova categoria de alarme (ex: "Operacional")
  addAlarmCategory(cat) {
    if (cat && !this._data.config.alarmCategories.includes(cat)) {
      this._data.config.alarmCategories.push(cat);
      this.save();
    }
  },

  // Verifica se os campos mínimos de config foram preenchidos
  isConfigured() {
    const c = this._data.config;
    return c.client && c.machine && c.speed > 0;
  },

  // ============================================================
  // MÉTODOS DE MEDIÇÃO
  // ============================================================

  // Inicia uma nova medição com o valor inicial do contador de produção
  startMeasurement(initialProduction) {
    const m = this._data.measurement;
    m.active = true;
    m.started = true;
    m.state = 'running';
    m.startTime = new Date().toISOString();
    m.endTime = null;
    m.shiftEndPrompted = false;
    m.events = [{ type: 'start', time: new Date().toISOString() }];
    m.initialProduction = initialProduction;
    m.productionReadings = [{ time: new Date().toISOString(), value: initialProduction }];
    m.lastProductionPrompt = Date.now();
    m.medicaoId = null;
    this.save();

    //Salva no backend 
       api.criarMedicao(this._data.config, initialProduction).then(resultado => {
      if (resultado?.id) {
        this._data.measurement.medicaoId = resultado.id;
        this.save();
      }
    });
  },

  // Muda estado para "rodando" IMEDIATAMENTE ao clicar Marcha.
  // IMPORTANTE: o motivo da parada anterior é registrado DEPOIS
  // pelo setStopReason(), sem afetar a contagem de tempo.
  // Isso garante que o tempo de seleção do motivo no modal
  // não seja contabilizado como tempo de máquina parada.
  setMarcha() {
    const m = this._data.measurement;
    m.state = 'running';
    m.events.push({ type: 'marcha', time: new Date().toISOString() });
    this.save();

    if (m.medicaoId) api.registrarEvento(m.medicaoId, 'marcha');
  },

  // Registra o motivo da última parada (chamado após o modal de motivo)
  // Busca o último evento 'stop' que ainda não tem motivo e preenche
  setStopReason(reason) {
    const m = this._data.measurement;
    const lastStop = [...m.events].reverse().find(e => e.type === 'stop');
    if (lastStop && !lastStop.reason) {
      lastStop.reason = reason;
      lastStop.category = this.getAlarmCategory(reason);
      this.save();
    }
  },

  // Busca a categoria de um alarme pelo nome (retorna 'Interna' se não encontrar)
  getAlarmCategory(alarmName) {
    const alarm = this._data.config.alarms.find(a => a.name === alarmName);
    return alarm ? alarm.category : 'Interna';
  },

  // Registra uma parada — estado muda pra 'stopped' imediatamente
  // O motivo (reason) começa null e é preenchido depois via setStopReason
  setParada() {
    const m = this._data.measurement;
    m.state = 'stopped';
    m.events.push({ type: 'stop', time: new Date().toISOString(), reason: null, category: null });
    this.save();

    if (m.medicaoId) api.registrarEvento(m.medicaoId, 'parada');
  },

  // ============================================================
  // MÉTODOS DE PRODUÇÃO
  // ============================================================

  // Adiciona uma leitura periódica de produção (valor do contador da máquina)
  // A produção real da medição = última leitura - leitura inicial
  addProductionReading(value) {
    const m = this._data.measurement;
    m.productionReadings.push({ time: new Date().toISOString(), value });
    m.lastProductionPrompt = Date.now();
    m.events.push({ type: 'production', time: new Date().toISOString(), value });
    this.save();
  },

  // Retorna o último valor de produção informado pelo auditor
  // Esse é o valor EXIBIDO nas telas (sem subtrair nada)
  getDisplayProduction() {
    const m = this._data.measurement;
    if (!m.productionReadings || m.productionReadings.length === 0) return 0;
    return m.productionReadings[m.productionReadings.length - 1].value;
  },

  // Calcula produção do período da medição (última leitura - leitura inicial)
  // Usado APENAS para cálculos de OEE e Performance, não para exibição direta
  getProductionForOEE() {
    const m = this._data.measurement;
    if (!m.productionReadings || m.productionReadings.length === 0) return 0;
    return m.productionReadings[m.productionReadings.length - 1].value - (m.initialProduction || 0);
  },

  // Retorna a última leitura de produção registrada
  getLastReading() {
    const m = this._data.measurement;
    if (!m.productionReadings || m.productionReadings.length === 0) return null;
    return m.productionReadings[m.productionReadings.length - 1];
  },

  // ============================================================
  // MÉTODOS DE PARADAS
  // ============================================================

  // Retorna array de todas as paradas com duração calculada
  // Cada parada vai de um evento 'stop' até o próximo 'marcha' ou 'end'
  // Se a medição foi finalizada, usa endTime como referência final
  getStops() {
    const m = this._data.measurement;
    const events = m.events;
    const stops = [];
    // Se a medição já terminou, usa endTime como fim das paradas abertas
    const endRef = m.endTime ? new Date(m.endTime) : new Date();
    for (let i = 0; i < events.length; i++) {
      if (events[i].type === 'stop') {
        // Procura o próximo evento que encerra esta parada
        const next = events.find((e, j) => j > i && (e.type === 'marcha' || e.type === 'start' || e.type === 'end'));
        const start = new Date(events[i].time);
        const end = next ? new Date(next.time) : endRef;
        stops.push({
          reason: events[i].reason || 'Não informado',
          category: events[i].category || 'Interna',
          start: events[i].time,
          end: next ? next.time : (m.endTime || null),
          durationMs: end - start,
        });
      }
    }
    return stops;
  },

  // Agrupa paradas por categoria e retorna totais
  // Exemplo: { "Interna": { count: 3, totalMs: 120000 }, "Externa": { count: 1, totalMs: 60000 } }
  getStopsByCategory() {
    const stops = this.getStops();
    const grouped = {};
    for (const s of stops) {
      if (!grouped[s.category]) grouped[s.category] = { count: 0, totalMs: 0 };
      grouped[s.category].count++;
      grouped[s.category].totalMs += s.durationMs;
    }
    return grouped;
  },

  // Retorna há quantos milissegundos a parada ATUAL está em andamento
  // Retorna 0 se a máquina não está parada
  getCurrentStopMs() {
    const m = this._data.measurement;
    if (m.state !== 'stopped') return 0;
    for (let i = m.events.length - 1; i >= 0; i--) {
      if (m.events[i].type === 'stop') return Date.now() - new Date(m.events[i].time).getTime();
    }
    return 0;
  },

  // ============================================================
  // MÉTODOS DE TEMPO
  // ============================================================

  // Tempo total decorrido desde o início da medição
  // Se a medição já finalizou, usa endTime em vez de Date.now()
  getElapsedMs() {
    const m = this._data.measurement;
    if (!m.startTime) return 0;
    const end = m.endTime ? new Date(m.endTime).getTime() : Date.now();
    return end - new Date(m.startTime).getTime();
  },

  // Tempo total que a máquina ficou rodando (elapsed - paradas)
  getRunningMs() {
    return Math.max(0, this.getElapsedMs() - this.getStoppedMs());
  },

  // Soma de todas as durações de parada
  getStoppedMs() {
    return this.getStops().reduce((sum, s) => sum + s.durationMs, 0);
  },

  // ============================================================
  // VERIFICAÇÕES PERIÓDICAS (chamadas a cada segundo pelo tick)
  // ============================================================

  // Verifica se é hora de pedir uma nova leitura de produção
  // Só pede se a medição tá ativa e a máquina tá rodando
  shouldPromptProduction() {
    const m = this._data.measurement;
    if (!m.active || m.state !== 'running') return false;
    const interval = (this._data.config.productionInterval || 30) * 60 * 1000;
    return Date.now() - (m.lastProductionPrompt || 0) >= interval;
  },

  // Verifica se o horário atual já passou do fim do turno configurado
  // Só dispara uma vez (controlado por shiftEndPrompted)
  shouldPromptShiftEnd() {
    const m = this._data.measurement;
    if (!m.active || m.shiftEndPrompted) return false;
    const endStr = this._data.config.shiftEnd;
    if (!endStr) return false;
    const now = new Date();
    const [h, min] = endStr.split(':').map(Number);
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min, 0);
    return now >= endToday;
  },

  // Marca que o alerta de fim de turno já foi mostrado (evita repetição)
  markShiftEndPrompted() {
    this._data.measurement.shiftEndPrompted = true;
    this.save();
  },

  // Reseta o flag de fim de turno (usado quando o auditor estende o turno)
  resetShiftEndPrompted() {
    this._data.measurement.shiftEndPrompted = false;
    this.save();
  },

  // ============================================================
  // FINALIZAÇÃO E RESET
  // ============================================================

  // Apaga todos os dados de medição e volta ao estado inicial
  resetMeasurement() {
    this._data.measurement = defaultData().measurement;
    this.save();
  },

  // Finaliza a medição: marca como inativa, registra horário de fim
  // O endTime é usado por getElapsedMs() e getStops() pra congelar os cálculos
  finalizeMeasurement() {
    const m = this._data.measurement;
    m.active = false;
    m.state = 'finished';
    m.endTime = new Date().toISOString();
    m.events.push({ type: 'end', time: new Date().toISOString() });
    this.save();

    if (m.medicaoId) {
      const producaoFinal = this.getDisplayProduction();
      api.finalizarMedicao(m.medicaoId, producaoFinal);
    }
  },

  // Exporta todos os dados como JSON formatado (pra download)
  exportJSON() {
    return JSON.stringify({
      config: this._data.config,
      measurement: this._data.measurement,
      stops: this.getStops(),
      stopsByCategory: this.getStopsByCategory(),
      totalProduction: this.getDisplayProduction(),
      productionForOEE: this.getProductionForOEE(),
      exported: new Date().toISOString(),
    }, null, 2);
  },

  // ============================================================
  // TEMA VISUAL
  // ============================================================

  // Retorna o tema atual ('dark' ou 'light')
  getTheme() { return this._data.config.theme || 'dark'; },

  // Altera o tema e aplica imediatamente no DOM
  setTheme(theme) { this._data.config.theme = theme; this.save(); this.applyTheme(); },

  // Aplica o tema no atributo data-theme do <html>
  // O CSS usa [data-theme="light"] pra trocar as variáveis de cor
  applyTheme() { document.documentElement.setAttribute('data-theme', this.getTheme()); },
};
