// ============================================================
// UTILS.JS — Funções utilitárias de formatação e vibração
// Usadas por todas as telas do app pra formatar tempos e
// dar feedback tátil no celular.
// ============================================================

// Formata milissegundos para HH:MM:SS (ex: 3661000 → "01:01:01")
export function formatTime(ms) {
  if (!ms || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Formata milissegundos para MM:SS (ex: 125000 → "02:05")
// Usado pra tempos menores onde não precisa de horas
export function formatTimeMM(ms) {
  if (!ms || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Converte ISO string ("2026-03-25T14:30:00") para "14:30:00"
// Usado na tela de paradas pra mostrar horários dos eventos
export function formatTimeHHMM(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// Formata número como porcentagem com 1 casa decimal (ex: 95.123 → "95.1%")
export function formatPercent(value) {
  if (isNaN(value) || !isFinite(value)) return '0%';
  return `${Math.round(value * 10) / 10}%`;
}

// Vibra o celular com o padrão informado (array de durações em ms)
// Ex: vibrate([200]) = vibra 200ms
// Ex: vibrate([200, 100, 200]) = vibra 200ms, pausa 100ms, vibra 200ms
// Falha silenciosamente se o dispositivo não suporta vibração
export function vibrate(pattern = [200]) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}
