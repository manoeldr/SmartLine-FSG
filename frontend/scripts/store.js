import { api } from './api.js';

// ============================================================
// STORE.JS — Camada de dados e persistência
// Responsável por salvar/carregar dados no localStorage,
// gerenciar estado da medição, alarmes, produção e paradas.
// Todas as outras telas consultam o store pra ler/escrever dados.
// ============================================================

const STORAGE_KEY = 'bottleline_data';

const defaultData = () => ({
  config: {
    client: '',
    clientId: null,
    machine: '',
    maquinaLinhaId: null,
    linhaId: null,
    speed: 0,
    shiftStart: '08:00',
    shiftEnd: '17:00',
    alarmCategories: ['Interna', 'Externa'],
    alarms: [
      { name: 'Falha no sensor', category: 'Interna' },
      { name: 'Falta de material', category: 'Externa' },
      { name: 'Ajuste mecânico', category: 'Interna' },
      { name: 'Troca de formato', category: 'Interna' },
      { name: 'Manutenção preventiva', category: 'Interna' },
      { name: 'Falta de energia', category: 'Externa' },
    ],
    productionInterval: 30,
    theme: 'dark',
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
    medicaoId: null,
  },
});

export const store = {
  _data: null,

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
        if (this._data.measurement.medicaoId === undefined) this._data.measurement.medicaoId = null;
      } catch {
        this._data = defaultData();
      }
    } else {
      this._data = defaultData();
    }
    this.save();
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
    console.log('isConfigured check:', c.client, c.machine, c.speed, c.maquinaId);
    return c.client && c.machine && c.speed > 0 && c.maquinaId;
  },

  // ============================================================
  // MÉTODOS DE MEDIÇÃO
  // ============================================================

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

    const cfg = this._data.config;
    api.criarMedicao({
      cliente: cfg.client,
      maquina: cfg.machine,
      turno_inicio: cfg.shiftStart,
      turno_fim: cfg.shiftEnd,
      velocidade_nominal: cfg.speed,
      producao_inicial: initialProduction,
      maquina_linha_id: cfg.maquinaLinhaId,
    }).then(resultado => {
      if (resultado?.id) {
        this._data.measurement.medicaoId = resultado.id;
        this.save();
      }
    }).catch(() => {});
  },

  setMarcha() {
    const m = this._data.measurement;
    m.state = 'running';
    m.events.push({ type: 'marcha', time: new Date().toISOString() });
    this.save();
    if (m.medicaoId) api.registrarEvento(m.medicaoId, 'marcha').catch(() => {});
  },

  setStopReason(reason) {
    const m = this._data.measurement;
    const lastStop = [...m.events].reverse().find(e => e.type === 'stop');
    if (lastStop && !lastStop.reason) {
      lastStop.reason = reason;
      lastStop.category = this.getAlarmCategory(reason);
      this.save();
    }
  },

  getAlarmCategory(alarmName) {
    const alarm = this._data.config.alarms.find(a => a.name === alarmName);
    return alarm ? alarm.category : 'Interna';
  },

  setParada() {
    const m = this._data.measurement;
    m.state = 'stopped';
    m.events.push({ type: 'stop', time: new Date().toISOString(), reason: null, category: null });
    this.save();
    if (m.medicaoId) api.registrarEvento(m.medicaoId, 'parada').catch(() => {});
  },

  // ============================================================
  // MÉTODOS DE PRODUÇÃO
  // ============================================================

  addProductionReading(value) {
    const m = this._data.measurement;
    m.productionReadings.push({ time: new Date().toISOString(), value });
    m.lastProductionPrompt = Date.now();
    m.events.push({ type: 'production', time: new Date().toISOString(), value });
    this.save();
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
    return end - new Date(m.startTime).getTime();
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
    const interval = (this._data.config.productionInterval || 30) * 60 * 1000;
    return Date.now() - (m.lastProductionPrompt || 0) >= interval;
  },

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

  markShiftEndPrompted() {
    this._data.measurement.shiftEndPrompted = true;
    this.save();
  },

  resetShiftEndPrompted() {
    this._data.measurement.shiftEndPrompted = false;
    this.save();
  },

  // ============================================================
  // FINALIZAÇÃO E RESET
  // ============================================================

  resetMeasurement() {
    this._data.measurement = defaultData().measurement;
    this.save();
  },

  finalizeMeasurement() {
    const m = this._data.measurement;
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

  // ============================================================
  // TEMA VISUAL
  // ============================================================

  getTheme() { return this._data.config.theme || 'dark'; },

  setTheme(theme) { this._data.config.theme = theme; this.save(); this.applyTheme(); },

  applyTheme() { document.documentElement.setAttribute('data-theme', this.getTheme()); },
};