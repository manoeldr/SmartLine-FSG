import { api } from './api.js';

// ============================================================
// STORE.JS — Camada de dados e persistência
// ============================================================

const STORAGE_KEY = 'bottleline_data';
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

const defaultData = () => ({
  config: {
    client: '',
    clientId: null,
    machine: '',
    maquinaLinhaId: null,
    linhaId: null,
    speed: 0,
    productMultiplier: 1,
    shiftStart: '08:00',
    shiftEnd: '17:00',
    alarmCategories: ['Interna', 'Externa'],
    alarms: [],
    productionInterval: 30,
    theme: 'light',
    // Flag: se true, exibe campo de refugo no modal de produção periódica
    temRefugo: false,
  },
  measurement: {
    active: false,
    started: false,
    state: 'idle',
    startTime: null,
    endTime: null,
    shiftEndPrompted: false,
    events: [],
    initialProduction: null,
    productionReadings: [],
    lastProductionPrompt: null,
    lastProductionSlot: 0,
    medicaoId: null,
    lastSyncedEventIndex: 0,
    lastSyncTime: null,
    tipo: 'manual',
    stateBeforePause: null,
  },
});

export const store = {
  _data: null,
  _syncTimer: null,

  init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        this._data = JSON.parse(saved);
        const def = defaultData();

        if (!this._data.config) this._data.config = def.config;
        if (!this._data.measurement) this._data.measurement = def.measurement;

        if (this._data.config.alarms && this._data.config.alarms.length > 0 && typeof this._data.config.alarms[0] === 'string') {
          this._data.config.alarms = this._data.config.alarms.map(a => ({ name: a, category: 'Interna' }));
        }

        if (!this._data.config.alarmCategories) this._data.config.alarmCategories = def.config.alarmCategories;
        if (!this._data.config.theme) this._data.config.theme = def.config.theme;
        if (!this._data.config.productionInterval) this._data.config.productionInterval = def.config.productionInterval;
        if (this._data.config.clientId === undefined) this._data.config.clientId = null;
        if (this._data.config.linhaId === undefined) this._data.config.linhaId = null;
        if (this._data.config.maquinaLinhaId === undefined) this._data.config.maquinaLinhaId = null;
        if (this._data.config.productMultiplier === undefined) this._data.config.productMultiplier = 1;
        if (this._data.config.temRefugo === undefined) this._data.config.temRefugo = false;
        if (this._data.measurement.medicaoId === undefined) this._data.measurement.medicaoId = null;
        if (this._data.measurement.lastSyncedEventIndex === undefined) this._data.measurement.lastSyncedEventIndex = 0;
        if (this._data.measurement.lastSyncTime === undefined) this._data.measurement.lastSyncTime = null;
        if (this._data.measurement.lastProductionSlot === undefined) this._data.measurement.lastProductionSlot = 0;
        if (!this._data.measurement.tipo) this._data.measurement.tipo = 'manual';
        if (this._data.measurement.stateBeforePause === undefined) this._data.measurement.stateBeforePause = null;
      } catch {
        this._data = defaultData();
      }
    } else {
      this._data = defaultData();
    }
    this.save();
    this._startSyncTimer();
  },

  save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data)); },

  get config() { return this._data.config; },
  get measurement() { return this._data.measurement; },

  updateConfig(partial) { Object.assign(this._data.config, partial); this.save(); },

  addAlarm(name, category) {
    if (name && !this._data.config.alarms.find(a => a.name === name)) {
      this._data.config.alarms.push({ name, category: category || 'Interna' });
      this.save();
    }
  },

  removeAlarm(index) { this._data.config.alarms.splice(index, 1); this.save(); },

  addAlarmCategory(cat) {
    if (cat && !this._data.config.alarmCategories.includes(cat)) {
      this._data.config.alarmCategories.push(cat);
      this.save();
    }
  },

  isConfigured() {
    const c = this._data.config;
    return c.client && c.linhaId;
  },

  // ============================================================
  // SINCRONIZAÇÃO COM O BACKEND
  // ============================================================

  _startSyncTimer() {
    if (this._syncTimer) clearInterval(this._syncTimer);
    this._syncTimer = setInterval(() => {
      if (this._data.measurement.active && this._data.measurement.medicaoId) {
        this.syncToBackend().catch(() => {});
      }
    }, SYNC_INTERVAL_MS);
  },

  async syncToBackend() {
    const m = this._data.measurement;
    if (!m.medicaoId || !m.active) return;

    const events = m.events;
    const lastIdx = m.lastSyncedEventIndex || 0;
    const pending = events.slice(lastIdx);

    for (const ev of pending) {
      try {
        if (ev.type === 'marcha') {
          await api.registrarEvento(m.medicaoId, 'marcha', ev.reason || null);
        } else if (ev.type === 'stop') {
          await api.registrarEvento(m.medicaoId, 'parada', ev.reason || null);
        } else if (ev.type === 'production') {
          await api.registrarEvento(m.medicaoId, 'producao', null, ev.value, ev.refugo || null);
        } else if (ev.type === 'pausa') {
          await api.registrarEvento(m.medicaoId, 'pausa', ev.reason || null);
        } else if (ev.type === 'retomada') {
          await api.registrarEvento(m.medicaoId, 'retomada', null);
        }
      } catch {
        break;
      }
      m.lastSyncedEventIndex = (m.lastSyncedEventIndex || 0) + 1;
    }

    m.lastSyncTime = new Date().toISOString();
    this.save();
  },

  async restoreFromBackendById(medicaoId, dados) {
    try {
      const resultado = await api.medicaoAtiva(dados.maquinaLinhaId);
      const eventos = resultado?.eventos || [];

      const m = this._data.measurement;
      const eventsLocal = [];
      let ultimoEstado = 'running';
      const productionReadings = [{ time: new Date().toISOString(), value: dados.producaoInicial }];

      for (const ev of eventos) {
        if (ev.tipo === 'marcha') {
          eventsLocal.push({ type: 'marcha', time: ev.timestamp });
          ultimoEstado = 'running';
        } else if (ev.tipo === 'parada') {
          eventsLocal.push({ type: 'stop', time: ev.timestamp, reason: ev.motivo || null, category: null, backendId: ev.id || null });
          ultimoEstado = 'stopped';
        } else if (ev.tipo === 'producao' && ev.producao_leitura !== null) {
          eventsLocal.push({ type: 'production', time: ev.timestamp, value: ev.producao_leitura, refugo: ev.refugo_leitura || null });
          productionReadings.push({ time: ev.timestamp, value: ev.producao_leitura, refugo: ev.refugo_leitura || null });
        } else if (ev.tipo === 'pausa') {
          eventsLocal.push({ type: 'pausa', time: ev.timestamp, reason: ev.motivo || null });
          ultimoEstado = 'paused';
        } else if (ev.tipo === 'retomada') {
          eventsLocal.push({ type: 'retomada', time: ev.timestamp });
          ultimoEstado = 'running';
        }
      }

      m.active = true;
      m.started = true;
      m.state = ultimoEstado;
      m.startTime = resultado.medicao?.timestamp_inicio || eventos[0]?.timestamp || new Date().toISOString();
      m.endTime = null;
      m.shiftEndPrompted = false;
      m.medicaoId = medicaoId;
      m.initialProduction = dados.producaoInicial;
      m.productionReadings = productionReadings;
      m.events = eventsLocal;
      m.lastSyncedEventIndex = eventsLocal.length;
      m.lastSyncTime = new Date().toISOString();
      m.lastProductionPrompt = Date.now();
      m.tipo = resultado.medicao?.tipo || dados.tipo || 'manual';
      m.stateBeforePause = null;

      const intervalMs = (this._data.config.productionInterval || 60) * 60 * 1000;
      const elapsed = Date.now() - new Date(m.startTime).getTime();
      m.lastProductionSlot = Math.floor(elapsed / intervalMs);

      this._data.config.machine = dados.maquina;
      this._data.config.maquinaLinhaId = dados.maquinaLinhaId;
      this._data.config.shiftStart = dados.turnoInicio;
      this._data.config.shiftEnd = dados.turnoFim;
      this._data.config.speed = dados.velocidade;
      if (dados.cliente) this._data.config.client = dados.cliente;
      if (dados.linhaId) this._data.config.linhaId = dados.linhaId;
      if (dados.temRefugo !== undefined) this._data.config.temRefugo = dados.temRefugo;

      this.save();
    } catch (e) {
      console.warn('[store] Erro ao restaurar medição por ID:', e);
    }
  },

  // ============================================================
  // MÉTODOS DE MEDIÇÃO
  // ============================================================

  startMeasurement(initialProduction, tipo = 'manual') {
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
    m.lastProductionSlot = 0;
    m.medicaoId = null;
    m.lastSyncedEventIndex = 0;
    m.lastSyncTime = null;
    m.tipo = tipo;
    m.stateBeforePause = null;
    this.save();

    const cfg = this._data.config;
    api.criarMedicao({
      cliente: cfg.client,
      maquina: cfg.machine,
      turno_inicio: cfg.shiftStart,
      turno_fim: cfg.shiftEnd,
      velocidade_nominal: cfg.speed,
      producao_inicial: initialProduction,
      maquina_linha_id: cfg.maquinaLinhaId,
      usuario_nome: window.usuarioAtual?.nome || null,
      tipo,
    }).then(resultado => {
      if (resultado?.id) {
        this._data.measurement.medicaoId = resultado.id;
        this._data.measurement.lastSyncedEventIndex = 1;
        this.save();
      }
    }).catch(() => {});
  },

  setMarcha() {
    const m = this._data.measurement;
    m.state = 'running';
    m.events.push({ type: 'marcha', time: new Date().toISOString() });
    m.lastSyncedEventIndex = m.events.length;
    this.save();
    if (m.medicaoId) api.registrarEvento(m.medicaoId, 'marcha').catch(() => {});
  },

  setStopReason(reason, category = null) {
    const m = this._data.measurement;
    const lastStop = [...m.events].reverse().find(e => e.type === 'stop');
    if (lastStop && !lastStop.reason) {
      lastStop.reason = reason;
      lastStop.category = category || this.getAlarmCategory(reason);
      this.save();
      if (m.medicaoId && lastStop.backendId) {
        api.atualizarMotivoEvento(m.medicaoId, lastStop.backendId, reason).catch(() => {});
      }
    }
  },

  getAlarmCategory(alarmName) {
    const alarm = this._data.config.alarms.find(a => a.name === alarmName);
    return alarm ? alarm.category : 'Interna';
  },

  setParada() {
    const m = this._data.measurement;
    m.state = 'stopped';
    const evento = { type: 'stop', time: new Date().toISOString(), reason: null, category: null, backendId: null };
    m.events.push(evento);
    m.lastSyncedEventIndex = m.events.length;
    this.save();
    if (m.medicaoId) {
      api.registrarEvento(m.medicaoId, 'parada').then(resultado => {
        if (resultado?.id) {
          evento.backendId = resultado.id;
          this.save();
        }
      }).catch(() => {});
    }
  },

  // ============================================================
  // MÉTODOS DE PAUSA PROGRAMADA
  // ============================================================

  setPausa(motivo = null) {
    const m = this._data.measurement;
    m.stateBeforePause = m.state;
    m.state = 'paused';
    const evento = { type: 'pausa', time: new Date().toISOString(), reason: motivo };
    m.events.push(evento);
    m.lastSyncedEventIndex = m.events.length;
    this.save();
    if (m.medicaoId) {
      api.registrarEvento(m.medicaoId, 'pausa', motivo).catch(() => {});
    }
  },

  setRetomada() {
    const m = this._data.measurement;
    m.state = m.stateBeforePause || 'running';
    m.stateBeforePause = null;
    m.events.push({ type: 'retomada', time: new Date().toISOString() });
    m.lastSyncedEventIndex = m.events.length;
    this.save();
    if (m.medicaoId) {
      api.registrarEvento(m.medicaoId, 'retomada').catch(() => {});
    }
  },

  isPaused() {
    return this._data.measurement.state === 'paused';
  },

  getPausaMs() {
    const m = this._data.measurement;
    const events = m.events;
    let pausaMs = 0;
    let pauseStart = null;

    for (const ev of events) {
      if (ev.type === 'pausa') {
        pauseStart = new Date(ev.time);
      } else if (ev.type === 'retomada' && pauseStart) {
        pausaMs += new Date(ev.time) - pauseStart;
        pauseStart = null;
      }
    }

    if (pauseStart && m.state === 'paused') {
      pausaMs += Date.now() - pauseStart.getTime();
    }

    return pausaMs;
  },

  getCurrentPausaMs() {
    const m = this._data.measurement;
    if (m.state !== 'paused') return 0;
    for (let i = m.events.length - 1; i >= 0; i--) {
      if (m.events[i].type === 'pausa') {
        return Date.now() - new Date(m.events[i].time).getTime();
      }
    }
    return 0;
  },

  // ============================================================
  // MÉTODOS DE PRODUÇÃO
  // ============================================================

  addProductionReading(value, refugo = null) {
    const m = this._data.measurement;
    m.productionReadings.push({ time: new Date().toISOString(), value, refugo });
    m.lastProductionPrompt = Date.now();
    m.events.push({ type: 'production', time: new Date().toISOString(), value, refugo });
    m.lastSyncedEventIndex = m.events.length;
    this.save();
    if (m.medicaoId) api.registrarEvento(m.medicaoId, 'producao', null, value, refugo).catch(() => {});
  },

  getDisplayProduction() {
    const m = this._data.measurement;
    if (!m.productionReadings || m.productionReadings.length === 0) return 0;
    return m.productionReadings[m.productionReadings.length - 1].value;
  },

  getProductionForOEE() {
    const m = this._data.measurement;
    if (!m.productionReadings || m.productionReadings.length === 0) return 0;
    return m.productionReadings[m.productionReadings.length - 1].value - (m.initialProduction || 0);
  },

  getLastReading() {
    const m = this._data.measurement;
    if (!m.productionReadings || m.productionReadings.length === 0) return null;
    return m.productionReadings[m.productionReadings.length - 1];
  },

  // ============================================================
  // MÉTODOS DE PARADAS
  // ============================================================

  getStops() {
    const m = this._data.measurement;
    const events = m.events;
    const stops = [];
    const endRef = m.endTime ? new Date(m.endTime) : new Date();
    for (let i = 0; i < events.length; i++) {
      if (events[i].type === 'stop') {
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

  getElapsedMs() {
    const m = this._data.measurement;
    if (!m.startTime) return 0;
    const end = m.endTime ? new Date(m.endTime).getTime() : Date.now();
    const total = end - new Date(m.startTime).getTime();
    return Math.max(0, total - this.getPausaMs());
  },

  getRunningMs() {
    return Math.max(0, this.getElapsedMs() - this.getStoppedMs());
  },

  getStoppedMs() {
    return this.getStops().reduce((sum, s) => sum + s.durationMs, 0);
  },

  // ============================================================
  // VERIFICAÇÕES PERIÓDICAS
  // ============================================================

  shouldPromptProduction() {
    const m = this._data.measurement;
    if (!m.active || m.state !== 'running') return false;
    if (!m.startTime) return false;
    if (m.tipo !== 'manual') return false;

    const intervalMs = (this._data.config.productionInterval || 60) * 60 * 1000;
    const elapsed = Date.now() - new Date(m.startTime).getTime();
    const currentSlot = Math.floor(elapsed / intervalMs);

    if (currentSlot < 1) return false;

    const lastSlot = m.lastProductionSlot || 0;
    return currentSlot > lastSlot;
  },

  shouldPromptShiftEnd() {
    const m = this._data.measurement;
    if (!m.active || m.shiftEndPrompted) return false;
    if (m.state === 'paused') return false;
    const endStr = this._data.config.shiftEnd;
    if (!endStr) return false;
    const now = new Date();
    const [h, min] = endStr.split(':').map(Number);
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min, 0);
    return now >= endToday;
  },

  markShiftEndPrompted() { this._data.measurement.shiftEndPrompted = true; this.save(); },
  resetShiftEndPrompted() { this._data.measurement.shiftEndPrompted = false; this.save(); },

  // ============================================================
  // FINALIZAÇÃO E RESET
  // ============================================================

  resetMeasurement() {
    this._data.measurement = defaultData().measurement;
    this.save();
  },

  finalizeMeasurement() {
    const m = this._data.measurement;
    if (m.state === 'paused') {
      this.setRetomada();
    }
    m.active = false;
    m.state = 'finished';
    m.endTime = new Date().toISOString();
    m.events.push({ type: 'end', time: new Date().toISOString() });
    this.save();
    if (m.medicaoId) {
      api.finalizarMedicao(m.medicaoId, this.getDisplayProduction()).catch(() => {});
    }
  },

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

  getTheme() { return this._data.config.theme || 'dark'; },
  setTheme(theme) { this._data.config.theme = theme; this.save(); this.applyTheme(); },
  applyTheme() { document.documentElement.setAttribute('data-theme', this.getTheme()); },
};