'use strict';

// Fila de sessões por tela (nível 2). Puro e determinístico: f(programa, sessões, instante).
// Especificação: docs/FBS_SESSION_ORCHESTRATION.md. A fila de mídias (nível 1) fica em public/fbs-core.js.

const { totalDuration, sequenceAt, itemDuration } = require('./public/fbs-core');

const STEP_LIMIT = 20000;
const MAX_ENTRIES = 100;
const DEFAULT_PRIORITY = 50;
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const REPEAT_MODES = new Set(['once', 'count', 'loop']);
const INTERRUPTS = new Set(['immediate', 'after-item', 'after-session']);
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

class ProgramError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProgramError';
    this.code = code;
  }
}

// ---------------------------------------------------------------- fuso horário (Intl)
const formatters = new Map();
function formatter(timeZone) {
  let value = formatters.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric',
      day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    formatters.set(timeZone, value);
  }
  return value;
}
function isTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone || timeZone.length > 64) return false;
  try { formatter(timeZone); return true; } catch { return false; }
}
function zonedParts(ms, timeZone) {
  const parts = {};
  for (const { type, value } of formatter(timeZone).formatToParts(new Date(ms))) parts[type] = Number(value);
  return parts;
}
function offsetAt(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  const floored = ms - (((ms % 1000) + 1000) % 1000);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - floored;
}
// Hora local -> UTC. Hora inexistente (início de horário de verão) desloca pela diferença do fuso.
function zonedToUtc(year, month, day, hour, minute, second, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = guess - offsetAt(guess, timeZone);
  return guess - offsetAt(first, timeZone);
}

// ---------------------------------------------------------------- validação
function fail(code, message) { throw new ProgramError(code, message); }
function optionalTime(value, label) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_PROGRAM', `${label} deve ser um instante em milissegundos.`);
  return value;
}

function normalizeEntry(raw, index, playlistExists, makeId) {
  if (!raw || typeof raw !== 'object') fail('INVALID_PROGRAM', `Entrada ${index + 1} inválida.`);
  const id = raw.id === undefined ? makeId() : raw.id;
  if (typeof id !== 'string' || !ID.test(id)) fail('INVALID_PROGRAM', `Entrada ${index + 1}: identificador inválido.`);
  if (typeof raw.playlistId !== 'string' || !playlistExists(raw.playlistId)) {
    fail('INVALID_PROGRAM', `Entrada ${index + 1}: a sessão não existe neste espaço.`);
  }
  const repeat = raw.repeat === undefined ? { mode: 'once' } : raw.repeat;
  if (!repeat || !REPEAT_MODES.has(repeat.mode)) fail('INVALID_PROGRAM', `Entrada ${index + 1}: repetição inválida.`);
  if (repeat.mode === 'count' && (!Number.isInteger(repeat.count) || repeat.count < 1 || repeat.count > 1000)) {
    fail('INVALID_PROGRAM', `Entrada ${index + 1}: o número de repetições deve ficar entre 1 e 1000.`);
  }
  const start = raw.start === undefined ? { type: 'sequence' } : raw.start;
  let normalizedStart;
  if (start?.type === 'sequence') normalizedStart = { type: 'sequence' };
  else if (start?.type === 'daily') {
    if (typeof start.time !== 'string' || !TIME.test(start.time)) fail('INVALID_PROGRAM', `Entrada ${index + 1}: horário deve usar HH:MM ou HH:MM:SS.`);
    let days = null;
    if (start.days !== undefined && start.days !== null) {
      if (!Array.isArray(start.days) || !start.days.length || start.days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
        fail('INVALID_PROGRAM', `Entrada ${index + 1}: dias da semana inválidos.`);
      }
      days = [...new Set(start.days)].sort();
    }
    normalizedStart = { type: 'daily', time: start.time, days };
  } else if (start?.type === 'at') {
    normalizedStart = { type: 'at', atMs: optionalTime(start.atMs, `Entrada ${index + 1}: início`) };
    if (normalizedStart.atMs === null) fail('INVALID_PROGRAM', `Entrada ${index + 1}: informe o instante de início.`);
  } else fail('INVALID_PROGRAM', `Entrada ${index + 1}: tipo de início inválido.`);
  const validFromMs = optionalTime(raw.validFromMs, `Entrada ${index + 1}: validade inicial`);
  const validUntilMs = optionalTime(raw.validUntilMs, `Entrada ${index + 1}: validade final`);
  if (validFromMs !== null && validUntilMs !== null && validUntilMs <= validFromMs) {
    fail('INVALID_PROGRAM', `Entrada ${index + 1}: a validade final deve ser posterior à inicial.`);
  }
  const endAfterMs = raw.endAfterMs === undefined || raw.endAfterMs === null ? null : raw.endAfterMs;
  if (endAfterMs !== null && (!Number.isSafeInteger(endAfterMs) || endAfterMs < 1000)) {
    fail('INVALID_PROGRAM', `Entrada ${index + 1}: a duração máxima deve ter pelo menos 1 segundo.`);
  }
  const interrupt = raw.interrupt === undefined ? 'immediate' : raw.interrupt;
  if (!INTERRUPTS.has(interrupt)) fail('INVALID_PROGRAM', `Entrada ${index + 1}: política de interrupção inválida.`);
  const priority = raw.priority === undefined ? DEFAULT_PRIORITY : raw.priority;
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) fail('INVALID_PROGRAM', `Entrada ${index + 1}: prioridade deve ficar entre 0 e 100.`);
  const onEnd = raw.onEnd === undefined ? 'next' : raw.onEnd;
  if (!['next', 'stop'].includes(onEnd)) fail('INVALID_PROGRAM', `Entrada ${index + 1}: transição final inválida.`);
  if (raw.required !== undefined && typeof raw.required !== 'boolean') fail('INVALID_PROGRAM', `Entrada ${index + 1}: obrigatoriedade inválida.`);
  return {
    id, playlistId: raw.playlistId,
    repeat: repeat.mode === 'count' ? { mode: 'count', count: repeat.count } : { mode: repeat.mode },
    start: normalizedStart, validFromMs, validUntilMs, endAfterMs, interrupt, priority, onEnd,
    required: raw.required === true,
  };
}

// Normaliza e valida o programa (sem cursor). Lança ProgramError.
function validateProgram(input, { playlistExists, makeId }) {
  if (!input || typeof input !== 'object') fail('INVALID_PROGRAM', 'Programa inválido.');
  if (!Array.isArray(input.entries) || input.entries.length > MAX_ENTRIES) {
    fail('INVALID_PROGRAM', `Use de 0 a ${MAX_ENTRIES} entradas na programação.`);
  }
  const timezone = input.timezone === undefined ? DEFAULT_TIMEZONE : input.timezone;
  if (!isTimeZone(timezone)) fail('INVALID_PROGRAM', 'Fuso horário inválido.');
  const endBehavior = input.endBehavior === undefined ? 'stop' : input.endBehavior;
  if (!['stop', 'repeat'].includes(endBehavior)) fail('INVALID_PROGRAM', 'Comportamento final inválido.');
  const idleOutput = input.idleOutput === undefined ? 'route' : input.idleOutput;
  if (!['route', 'logo', 'blackout', 'idle'].includes(idleOutput)) fail('INVALID_PROGRAM', 'Saída ociosa inválida.');
  const fallback = input.fallback === undefined ? 'stream' : input.fallback;
  if (!['stream', 'logo', 'blackout'].includes(fallback)) fail('INVALID_PROGRAM', 'Alternativa para mídia pendente inválida.');
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') fail('INVALID_PROGRAM', 'Habilitação inválida.');
  const entries = input.entries.map((entry, index) => normalizeEntry(entry, index, playlistExists, makeId));
  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) fail('INVALID_PROGRAM', 'Há entradas com identificador repetido.');
    ids.add(entry.id);
  }
  // Loop sequencial sem limite: a próxima sequencial só é alcançável se houver uma entrada por horário entre as duas
  // (o fluxo continua após o índice do gatilho). Caso contrário ela ficaria inalcançável.
  entries.forEach((entry, position) => {
    const unbounded = entry.start.type === 'sequence' && entry.repeat.mode === 'loop' && entry.endAfterMs === null
      && entry.validUntilMs === null && entry.onEnd === 'next';
    if (!unbounded) return;
    for (let next = position + 1; next < entries.length; next++) {
      if (entries[next].start.type !== 'sequence') return;
      fail('UNBOUNDED_LOOP', 'Uma sessão em loop sem duração máxima impede as sessões seguintes. Defina uma duração, um horário intermediário ou mova-a para o fim.');
    }
  });
  return { enabled: input.enabled !== false, timezone, endBehavior, idleOutput, fallback, entries };
}

// ---------------------------------------------------------------- simulação
function prepare(program, ctx) {
  const entries = program.entries || [];
  const index = new Map(entries.map((entry, position) => [entry.id, position]));
  const durations = new Map();
  const items = playlistId => ctx.itemsOf(playlistId) || [];
  const durationOf = entry => {
    if (!durations.has(entry.playlistId)) durations.set(entry.playlistId, totalDuration(items(entry.playlistId)));
    return durations.get(entry.playlistId);
  };
  const length = entry => {
    const duration = durationOf(entry);
    let value = entry.repeat.mode === 'once' ? duration : entry.repeat.mode === 'count' ? duration * entry.repeat.count : Infinity;
    if (entry.endAfterMs !== null && entry.endAfterMs !== undefined) value = Math.min(value, entry.endAfterMs);
    return value;
  };
  const validAt = (entry, t) => durationOf(entry) > 0 && (entry.validFromMs == null || t >= entry.validFromMs)
    && (entry.validUntilMs == null || t < entry.validUntilMs);
  const priority = entry => entry.priority ?? DEFAULT_PRIORITY;
  const timeZone = program.timezone || DEFAULT_TIMEZONE;

  function triggerAfter(entry, t) {
    const from = entry.validFromMs != null ? Math.max(t, entry.validFromMs - 1) : t;
    let at = null;
    if (entry.start.type === 'at') at = entry.start.atMs > from ? entry.start.atMs : null;
    else if (entry.start.type === 'daily') {
      const [hour, minute, second = 0] = entry.start.time.split(':').map(Number);
      const local = zonedParts(from, timeZone);
      for (let day = 0; day <= 8 && at === null; day++) {
        const calendar = new Date(Date.UTC(local.year, local.month - 1, local.day + day));
        if (entry.start.days && !entry.start.days.includes(calendar.getUTCDay())) continue;
        const candidate = zonedToUtc(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, calendar.getUTCDate(), hour, minute, second, timeZone);
        if (candidate > from) at = candidate;
      }
    }
    if (at === null || (entry.validUntilMs != null && at >= entry.validUntilMs) || !validAt(entry, at)) return null;
    return at;
  }

  function nextTrigger(t) {
    let best = null;
    entries.forEach((entry, position) => {
      if (entry.start.type === 'sequence') return;
      const at = triggerAfter(entry, t);
      if (at === null) return;
      if (!best || at < best.at || (at === best.at && (priority(entry) > best.priority
        || (priority(entry) === best.priority && position < best.position)))) {
        best = { at, entry, priority: priority(entry), position };
      }
    });
    return best;
  }

  function nextSequential(from, t) {
    for (let position = from; position < entries.length; position++) {
      const entry = entries[position];
      if (entry.start.type === 'sequence' && validAt(entry, t)) return entry;
    }
    return null;
  }

  function entryEnd(entry, start, t) {
    let end = start + length(entry);
    if (entry.validUntilMs != null) end = Math.min(end, entry.validUntilMs);
    return Math.max(end, t);
  }

  function itemEndAfter(entry, start, t) {
    const list = items(entry.playlistId);
    const position = sequenceAt(list, t - start, null);
    if (position.index < 0) return t;
    return t + (itemDuration(list[position.index]) - position.itemOffsetMs);
  }

  function nextBoundary(t) {
    let value = Infinity;
    for (const entry of entries) {
      for (const edge of [entry.validFromMs, entry.validUntilMs]) if (edge != null && edge > t && edge < value) value = edge;
    }
    return value;
  }

  // Duração de um ciclo completo das sequenciais (para avanço rápido); null se não for seguro.
  function cycleLength(t) {
    let total = 0;
    for (const entry of entries) {
      if (entry.start.type !== 'sequence' || !validAt(entry, t)) continue;
      if (entry.onEnd !== 'next') return null;
      const value = length(entry);
      if (!Number.isFinite(value)) return null;
      total += value;
    }
    return total > 0 ? total : null;
  }

  function cycleSteps(t) {
    return entries.filter(entry => entry.start.type === 'sequence' && validAt(entry, t)).map(entry => ({ entry, lengthMs: length(entry) }));
  }

  return { entries, index, durationOf, length, validAt, priority, nextTrigger, nextSequential, entryEnd, itemEndAfter, nextBoundary, cycleLength, cycleSteps };
}

function better(current, candidate) {
  if (!current) return candidate;
  return candidate.priority >= current.priority ? candidate : current;
}

/* Simula o programa do cursor até untilMs.
 * Retorna { status, entry, startMs, pending, nextChangeMs, spans[] }.
 * spans: intervalos [fromMs,toMs) com a entrada no ar (ou null = parado) que terminam depois de collectFromMs. */
function simulate(program, ctx, untilMs, { collectFromMs = untilMs, maxSpans = 64 } = {}) {
  const model = prepare(program, ctx);
  const cursor = program.cursor || { atMs: untilMs, entryId: null, offsetMs: 0, pending: null, paused: false };
  const byId = id => (model.index.has(id) ? model.entries[model.index.get(id)] : null);
  let t = cursor.atMs;
  let current = byId(cursor.entryId);
  let start = current ? t - Math.max(0, cursor.offsetMs || 0) : t;
  // Identidade estável da execução no ar: a do cursor enquanto a mesma execução continua; senão o instante de entrada.
  const cursorEntry = current;
  const cursorStart = start;
  const cursorKey = typeof cursor.key === 'string' ? cursor.key : `s${start}`;
  const keyOf = () => (current && current === cursorEntry && start === cursorStart ? cursorKey : `s${start}`);
  if (cursor.paused) {
    return { status: current ? 'paused' : 'stopped', entry: current, startMs: null, offsetMs: current ? cursor.offsetMs : 0, key: cursorKey,
      pending: null, nextChangeMs: null, spans: [{ fromMs: t, toMs: null, entry: current, startMs: null, frozenOffsetMs: cursor.offsetMs || 0, key: cursorKey }] };
  }
  let pending = null;
  if (cursor.pending && byId(cursor.pending.entryId)) {
    pending = { entry: byId(cursor.pending.entryId), at: cursor.pending.atMs ?? null, priority: cursor.pending.priority ?? DEFAULT_PRIORITY };
  }
  const spans = [];
  let spanFrom = t;
  const close = to => {
    if (to > spanFrom && to > collectFromMs && spans.length < maxSpans) spans.push({ fromMs: spanFrom, toMs: to, entry: current, startMs: start, key: keyOf() });
    spanFrom = to;
  };
  let steps = 0;
  while (true) {
    if (++steps > STEP_LIMIT) {
      return { status: 'error', error: 'SIMULATION_LIMIT', entry: null, startMs: null, offsetMs: 0, pending: null, nextChangeMs: null, spans };
    }
    const end = current ? model.entryEnd(current, start, t) : Infinity;
    const switchAt = pending ? Math.min(pending.at ?? end, end) : Infinity;
    const local = Math.min(end, switchAt);
    const trigger = model.nextTrigger(t);
    const triggerFirst = Boolean(trigger) && trigger.at <= local;
    const eventAt = triggerFirst ? trigger.at : local;
    if (eventAt > untilMs) {
      if (spans.length < maxSpans) spans.push({ fromMs: spanFrom, toMs: Number.isFinite(eventAt) ? eventAt : null, entry: current, startMs: start, key: keyOf(), open: true });
      return {
        status: current ? 'playing' : 'stopped', entry: current, startMs: current ? start : null,
        offsetMs: current ? untilMs - start : 0, key: current ? keyOf() : null,
        pending: pending ? { entryId: pending.entry.id, atMs: pending.at, priority: pending.priority } : null,
        nextChangeMs: Number.isFinite(eventAt) ? eventAt : null, spans,
      };
    }
    if (triggerFirst) {
      t = trigger.at;
      if (!current) { close(t); current = trigger.entry; start = t; pending = null; continue; }
      if (trigger.priority < model.priority(current)) {
        pending = better(pending, { entry: trigger.entry, at: null, priority: trigger.priority });
        continue;
      }
      if (trigger.entry.interrupt === 'immediate') { close(t); current = trigger.entry; start = t; pending = null; continue; }
      const at = trigger.entry.interrupt === 'after-item' ? Math.min(model.itemEndAfter(current, start, t), end) : null;
      pending = better(pending, { entry: trigger.entry, at, priority: trigger.priority });
      continue;
    }
    t = local;
    if (pending && switchAt === t) {
      const chosen = pending;
      pending = null;
      if (model.validAt(chosen.entry, t)) { close(t); current = chosen.entry; start = t; continue; }
      if (t < end) continue;
    }
    // Fim da entrada atual.
    close(t);
    if (current.onEnd === 'stop') { current = null; start = t; continue; }
    let next = model.nextSequential(model.index.get(current.id) + 1, t);
    if (!next && program.endBehavior === 'repeat') {
      next = model.nextSequential(0, t);
      const cycle = next && model.cycleLength(t);
      if (cycle) {
        const upcoming = model.nextTrigger(t);
        const hardLimit = Math.min(upcoming ? upcoming.at : Infinity, untilMs, model.nextBoundary(t));
        if (t < collectFromMs) {
          // Antes da janela coletada: avanço aritmético (fora do plano).
          const limit = Math.min(hardLimit, collectFromMs);
          const skip = Math.floor((limit - t) / cycle) - 1;
          if (skip > 0 && Number.isFinite(limit)) { t += skip * cycle; spanFrom = t; }
        } else if (Number.isFinite(hardLimit) && spans.length < maxSpans) {
          // Dentro da janela: um único span "cycle" representa k ciclos idênticos (plano compacto).
          const repeats = Math.floor((hardLimit - t) / cycle);
          if (repeats >= 2) {
            spans.push({ fromMs: t, toMs: t + repeats * cycle, entry: null, startMs: t, cycleMs: cycle, cycle: model.cycleSteps(t) });
            t += repeats * cycle;
            spanFrom = t;
          }
        }
      }
    }
    current = next;
    start = t;
  }
}

function resolveProgram(program, ctx, nowMs) {
  return simulate(program, ctx, nowMs);
}

// Cursor rebaseado no estado resolvido em nowMs (usado por toda edição e comando).
function rebaseCursor(program, ctx, nowMs) {
  const state = simulate(program, ctx, nowMs);
  if (state.status === 'paused') return { ...program.cursor };
  return {
    atMs: nowMs, entryId: state.entry ? state.entry.id : null, key: state.entry ? state.key : null,
    offsetMs: state.entry ? nowMs - state.startMs : 0, pending: state.pending, paused: false,
  };
}

// Cursor de início: a entrada pedida, ou a primeira sequencial válida em atMs (null = parado até um gatilho).
function startCursor(program, ctx, atMs, entryId = null) {
  const model = prepare(program, ctx);
  let entry = entryId && model.index.has(entryId) ? model.entries[model.index.get(entryId)] : null;
  if (!entry && !entryId) entry = model.nextSequential(0, atMs);
  return { atMs, entryId: entry ? entry.id : null, key: entry ? `s${atMs}` : null, offsetMs: 0, pending: null, paused: false };
}

function nextTriggerAt(program, ctx, t) {
  const trigger = prepare(program, ctx).nextTrigger(t);
  return trigger ? trigger.at : null;
}

// Entrada sequencial vizinha (para os comandos next-session/previous-session).
function neighborEntry(program, ctx, entryId, direction, atMs) {
  const model = prepare(program, ctx);
  const from = model.index.has(entryId) ? model.index.get(entryId) : -1;
  for (let position = from + direction; position >= 0 && position < model.entries.length; position += direction) {
    const entry = model.entries[position];
    if (entry.start.type === 'sequence' && model.validAt(entry, atMs)) return entry;
  }
  if (direction > 0 && program.endBehavior === 'repeat') return model.nextSequential(0, atMs);
  return null;
}

module.exports = {
  ProgramError, validateProgram, simulate, resolveProgram, rebaseCursor, startCursor, neighborEntry, nextTriggerAt, zonedToUtc, isTimeZone,
  STEP_LIMIT, DEFAULT_TIMEZONE,
};
