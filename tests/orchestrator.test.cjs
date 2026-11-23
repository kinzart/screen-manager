'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../web/public/fbs-core');
const {
  validateProgram, simulate, resolveProgram, rebaseCursor, startCursor, neighborEntry, zonedToUtc, STEP_LIMIT,
} = require('../web/orchestrator');

const S = 1000;
const MIN = 60 * S;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// 2026-11-23 09:00 em São Paulo (UTC-3, sem horário de verão).
const T0 = Date.UTC(2026, 10, 23, 12, 0, 0);
const PLAYLISTS = {
  A: [{ id: 'a1', mediaId: 'm1', durationMs: 10 * S }, { id: 'a2', mediaId: 'm2', durationMs: 20 * S }], // 30 s
  B: [{ id: 'b1', mediaId: 'm3', durationMs: 5 * S }], // 5 s
  C: [{ id: 'c1', mediaId: 'm4', durationMs: 60 * S }], // 60 s
  EMPTY: [],
};
const ctx = { itemsOf: id => PLAYLISTS[id] || null };
let counter = 0;
const makeId = () => `e${++counter}`;

function program(entries, options = {}) {
  const normalized = validateProgram({ entries, ...options }, { playlistExists: id => id in PLAYLISTS, makeId });
  normalized.cursor = startCursor(normalized, ctx, options.startAt ?? T0, options.startEntry ?? null);
  return normalized;
}
const at = (p, t) => resolveProgram(p, ctx, t);
const idAt = (p, t) => at(p, t).entry?.id ?? null;

test('núcleo de mídias: sequenceAt respeita passagens, fim e repetição infinita', () => {
  assert.deepEqual(core.sequenceAt(PLAYLISTS.A, 0, 1).index, 0);
  assert.equal(core.sequenceAt(PLAYLISTS.A, 10 * S, 1).index, 1);
  assert.equal(core.sequenceAt(PLAYLISTS.A, 29 * S, 1).itemOffsetMs, 19 * S);
  const ended = core.sequenceAt(PLAYLISTS.A, 30 * S, 1);
  assert.equal(ended.ended, true);
  assert.equal(ended.index, 1);
  const second = core.sequenceAt(PLAYLISTS.A, 35 * S, 2);
  assert.deepEqual([second.index, second.pass, second.itemOffsetMs, second.ended], [0, 1, 5 * S, false]);
  assert.equal(core.sequenceAt(PLAYLISTS.A, 1e9, null).ended, false);
  assert.equal(core.sequenceAt([], 0, 1).index, -1);
});

test('critério 1: sequência once → count(2) → loop com durações exatas', () => {
  const p = program([
    { id: 's1', playlistId: 'A' },
    { id: 's2', playlistId: 'B', repeat: { mode: 'count', count: 2 } },
    { id: 's3', playlistId: 'C', repeat: { mode: 'loop' } },
  ]);
  assert.equal(idAt(p, T0), 's1');
  assert.equal(idAt(p, T0 + 29_999), 's1');
  assert.equal(idAt(p, T0 + 30 * S), 's2');
  const second = at(p, T0 + 36 * S);
  assert.equal(second.entry.id, 's2');
  assert.equal(second.offsetMs, 6 * S);
  assert.equal(core.sequenceAt(PLAYLISTS.B, second.offsetMs, 2).pass, 1);
  assert.equal(idAt(p, T0 + 40 * S), 's3');
  assert.equal(idAt(p, T0 + 5 * DAY), 's3');
  assert.equal(at(p, T0 + 40 * S).nextChangeMs, null, 'loop sem limite e sem gatilho não tem próxima troca');
});

test('critério 2: gatilho diário interrompe o loop e o fluxo segue para a sequencial seguinte', () => {
  const p = program([
    { id: 'loop', playlistId: 'C', repeat: { mode: 'loop' } },
    { id: 'daily', playlistId: 'B', start: { type: 'daily', time: '09:30' } },
    { id: 'after', playlistId: 'A' },
  ]);
  assert.equal(idAt(p, T0 + 30 * MIN - 1), 'loop');
  assert.equal(at(p, T0).nextChangeMs, T0 + 30 * MIN);
  assert.equal(idAt(p, T0 + 30 * MIN), 'daily');
  assert.equal(idAt(p, T0 + 30 * MIN + 5 * S), 'after');
  assert.equal(at(p, T0 + 30 * MIN + 35 * S).status, 'stopped');
  assert.equal(idAt(p, T0 + DAY + 30 * MIN + 1 * S), 'daily', 'repete no dia seguinte');
});

test('critério 3: gatilho de prioridade menor fica pendente até o fim da entrada atual', () => {
  const p = program([
    { id: 'main', playlistId: 'A', repeat: { mode: 'count', count: 3 }, priority: 80 },
    { id: 'low', playlistId: 'B', start: { type: 'at', atMs: T0 + 10 * S }, priority: 10 },
  ]);
  const during = at(p, T0 + 50 * S);
  assert.equal(during.entry.id, 'main');
  assert.equal(during.pending.entryId, 'low');
  assert.equal(idAt(p, T0 + 90 * S), 'low');
  assert.equal(at(p, T0 + 95 * S).status, 'stopped');
});

test('critério 4: after-item troca no fim exato da mídia; after-session no fim da sessão', () => {
  const item = program([
    { id: 'base', playlistId: 'A', repeat: { mode: 'loop' }, endAfterMs: HOUR },
    { id: 'cut', playlistId: 'B', start: { type: 'at', atMs: T0 + 15 * S }, interrupt: 'after-item' },
  ]);
  assert.equal(idAt(item, T0 + 29_999), 'base');
  assert.equal(idAt(item, T0 + 30 * S), 'cut');
  const session = program([
    { id: 'base', playlistId: 'A', repeat: { mode: 'count', count: 2 } },
    { id: 'cut', playlistId: 'B', start: { type: 'at', atMs: T0 + 5 * S }, interrupt: 'after-session' },
  ]);
  assert.equal(idAt(session, T0 + 59_999), 'base');
  assert.equal(idAt(session, T0 + 60 * S), 'cut');
});

test('critério 5: janela de validade pula entradas e encerra a entrada ao fechar', () => {
  const skip = program([
    { id: 'future', playlistId: 'A', validFromMs: T0 + HOUR },
    { id: 'now', playlistId: 'B' },
  ]);
  assert.equal(idAt(skip, T0), 'now');
  const closing = program([
    { id: 'window', playlistId: 'C', repeat: { mode: 'loop' }, validUntilMs: T0 + 100 * S },
    { id: 'next', playlistId: 'B' },
  ]);
  assert.equal(idAt(closing, T0 + 99 * S), 'window');
  assert.equal(idAt(closing, T0 + 100 * S), 'next');
  const empty = program([{ id: 'nothing', playlistId: 'EMPTY' }, { id: 'real', playlistId: 'B' }]);
  assert.equal(idAt(empty, T0), 'real', 'sessão vazia nunca é elegível');
});

test('critério 6: repeat com avanço rápido em 30 dias, com e sem gatilhos diários', () => {
  const p = program([{ id: 'b', playlistId: 'B' }, { id: 'a', playlistId: 'A' }], { endBehavior: 'repeat' });
  const target = T0 + 30 * DAY + 7 * S;
  const state = at(p, target);
  assert.notEqual(state.status, 'error');
  const phase = (target - T0) % (35 * S);
  assert.equal(state.entry.id, phase < 5 * S ? 'b' : 'a');
  const withTriggers = program([
    { id: 'b', playlistId: 'B' }, { id: 'a', playlistId: 'A' },
    { id: 'noon', playlistId: 'C', start: { type: 'daily', time: '12:00' } },
  ], { endBehavior: 'repeat' });
  const noon = Date.UTC(2026, 11, 20, 15, 0, 30); // 20/12 12:00:30 em São Paulo
  assert.equal(idAt(withTriggers, noon), 'noon');
  assert.notEqual(at(withTriggers, noon + 2 * HOUR).status, 'error');
  assert.ok(STEP_LIMIT >= 10000);
});

test('critério 7: determinismo e equivalência ao rebasear o cursor em qualquer instante', () => {
  const entries = [
    { id: 'x', playlistId: 'A', repeat: { mode: 'count', count: 3 } },
    { id: 'y', playlistId: 'B', repeat: { mode: 'loop' }, endAfterMs: 47 * S },
    { id: 'z', playlistId: 'C', start: { type: 'daily', time: '09:07:13' }, interrupt: 'after-item' },
    { id: 'w', playlistId: 'A' },
  ];
  const p = program(entries, { endBehavior: 'repeat' });
  let seed = 42;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 200; i++) {
    const middle = T0 + Math.floor(random() * 3 * HOUR);
    const target = middle + Math.floor(random() * 2 * HOUR);
    const direct = at(p, target);
    assert.deepEqual(at(p, target), direct, 'mesmo instante, mesmo resultado');
    const rebased = { ...p, cursor: rebaseCursor(p, ctx, middle) };
    const viaRebase = at(rebased, target);
    assert.equal(viaRebase.entry?.id ?? null, direct.entry?.id ?? null, `entrada em ${target - T0}`);
    assert.equal(viaRebase.startMs, direct.startMs, `início em ${target - T0}`);
  }
});

test('critério 8: pausa congela e retoma do ponto exato; gatilhos na pausa não retroagem', () => {
  const p = program([
    { id: 'long', playlistId: 'C', repeat: { mode: 'count', count: 10 } },
    { id: 'trigger', playlistId: 'B', start: { type: 'at', atMs: T0 + 100 * S } },
  ]);
  const paused = { ...p, cursor: { ...rebaseCursor(p, ctx, T0 + 12 * S), paused: true } };
  const frozen = at(paused, T0 + 500 * S);
  assert.equal(frozen.status, 'paused');
  assert.equal(frozen.offsetMs, 12 * S);
  const resumed = { ...p, cursor: { ...paused.cursor, atMs: T0 + 600 * S, paused: false } };
  const state = at(resumed, T0 + 603 * S);
  assert.equal(state.entry.id, 'long');
  assert.equal(state.offsetMs, 15 * S);
});

test('critério 9: validação recusa loop sem limite que bloqueia a sequência', () => {
  const options = { playlistExists: id => id in PLAYLISTS, makeId };
  assert.throws(() => validateProgram({ entries: [
    { playlistId: 'C', repeat: { mode: 'loop' } }, { playlistId: 'A' },
  ] }, options), { code: 'UNBOUNDED_LOOP' });
  assert.doesNotThrow(() => validateProgram({ entries: [
    { playlistId: 'C', repeat: { mode: 'loop' } }, { playlistId: 'B', start: { type: 'daily', time: '10:00' } }, { playlistId: 'A' },
  ] }, options));
  assert.doesNotThrow(() => validateProgram({ entries: [
    { playlistId: 'C', repeat: { mode: 'loop' }, endAfterMs: MIN }, { playlistId: 'A' },
  ] }, options));
  for (const bad of [
    { playlistId: 'nope' }, { playlistId: 'A', repeat: { mode: 'count', count: 0 } },
    { playlistId: 'A', start: { type: 'daily', time: '25:00' } }, { playlistId: 'A', priority: 101 },
    { playlistId: 'A', validFromMs: 10, validUntilMs: 5 }, { playlistId: 'A', endAfterMs: 10 },
    { playlistId: 'A', interrupt: 'never' },
  ]) assert.throws(() => validateProgram({ entries: [bad] }, options), { code: 'INVALID_PROGRAM' });
  assert.throws(() => validateProgram({ entries: [], timezone: 'Mars/Olympus' }, options), { code: 'INVALID_PROGRAM' });
});

test('critério 10: gatilho diário respeita fuso e horário de verão', () => {
  assert.equal(zonedToUtc(2026, 3, 7, 9, 0, 0, 'America/New_York'), Date.UTC(2026, 2, 7, 14, 0, 0));
  assert.equal(zonedToUtc(2026, 3, 9, 9, 0, 0, 'America/New_York'), Date.UTC(2026, 2, 9, 13, 0, 0));
  const start = Date.UTC(2026, 2, 7, 12, 0, 0);
  const p = program([{ id: 'nine', playlistId: 'B', start: { type: 'daily', time: '09:00' } }],
    { timezone: 'America/New_York', startAt: start });
  assert.equal(at(p, start).status, 'stopped');
  assert.equal(at(p, Date.UTC(2026, 2, 7, 14, 0, 1)).startMs, Date.UTC(2026, 2, 7, 14, 0, 0));
  assert.equal(at(p, Date.UTC(2026, 2, 8, 13, 0, 1)).startMs, Date.UTC(2026, 2, 8, 13, 0, 0), 'dia da mudança');
  assert.equal(at(p, Date.UTC(2026, 2, 9, 13, 0, 1)).startMs, Date.UTC(2026, 2, 9, 13, 0, 0));
  const weekdays = program([{ id: 'mon', playlistId: 'B', start: { type: 'daily', time: '09:00', days: [1] } }], { startAt: T0 });
  // T0 é segunda-feira 09:00 em São Paulo: o próximo disparo é na segunda seguinte.
  assert.equal(at(weekdays, T0 + 2 * DAY).status, 'stopped');
  assert.equal(at(weekdays, T0 + 7 * DAY + S).startMs, T0 + 7 * DAY);
});

test('gatilhos simultâneos: maior prioridade vence, empate pelo menor índice', () => {
  const p = program([
    { id: 'base', playlistId: 'C', repeat: { mode: 'loop' } },
    { id: 'first', playlistId: 'A', start: { type: 'at', atMs: T0 + MIN } },
    { id: 'urgent', playlistId: 'B', start: { type: 'at', atMs: T0 + MIN }, priority: 90 },
    { id: 'tie', playlistId: 'A', start: { type: 'at', atMs: T0 + 2 * MIN } },
    { id: 'tie2', playlistId: 'B', start: { type: 'at', atMs: T0 + 2 * MIN } },
  ], { endBehavior: 'stop' });
  assert.equal(idAt(p, T0 + MIN), 'urgent');
  assert.equal(idAt(p, T0 + 2 * MIN), 'tie');
});

test('onEnd stop, programa parado e vizinhos para comandos de sessão', () => {
  const p = program([
    { id: 'one', playlistId: 'B', onEnd: 'stop' },
    { id: 'two', playlistId: 'A' },
  ]);
  assert.equal(at(p, T0 + 6 * S).status, 'stopped');
  assert.equal(neighborEntry(p, ctx, 'one', 1, T0).id, 'two');
  assert.equal(neighborEntry(p, ctx, 'two', -1, T0).id, 'one');
  assert.equal(neighborEntry(p, ctx, 'two', 1, T0), null);
});

test('ciclos compactos: expansão equivale à simulação passo a passo (entrada, início e chave)', () => {
  const p = program([
    { id: 'b', playlistId: 'B' }, { id: 'a', playlistId: 'A', repeat: { mode: 'count', count: 2 } },
    { id: 'big', playlistId: 'C', start: { type: 'at', atMs: T0 + HOUR } },
  ], { endBehavior: 'repeat' });
  const result = simulate(p, ctx, T0 + 6 * HOUR, { collectFromMs: T0, maxSpans: 128 });
  const cycles = result.spans.filter(span => span.cycle);
  assert.ok(cycles.length >= 2, 'ciclos antes e depois do gatilho');
  assert.ok(result.spans.some(span => span.entry?.id === 'big'), 'a sessão das +1h está no plano');
  assert.ok(result.spans.length < 20, `plano compacto (${result.spans.length} spans)`);
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 300; i++) {
    const t = T0 + Math.floor(random() * 6 * HOUR);
    const span = result.spans.find(entry => t >= entry.fromMs && (entry.toMs === null || t < entry.toMs));
    const direct = at(p, t);
    if (!span?.cycle) continue;
    const expanded = core.expandSegment({
      kind: 'cycle', fromMs: span.fromMs, toMs: span.toMs, cycleMs: span.cycleMs, keyPrefix: '',
      steps: span.cycle.map(step => ({ playlistId: step.entry.playlistId, entryId: step.entry.id, lengthMs: step.lengthMs })),
    }, t);
    assert.equal(expanded.entryId, direct.entry.id, `entrada em +${t - T0}`);
    assert.equal(expanded.fromMs, direct.startMs, `início em +${t - T0}`);
    assert.equal(expanded.key, direct.key, `chave em +${t - T0}`);
  }
});

test('spans: plano futuro lista segmentos e respeita o limite', () => {
  const p = program([{ id: 'b', playlistId: 'B' }, { id: 'a', playlistId: 'A', endAfterMs: 20 * S },
    { id: 'tick', playlistId: 'B', start: { type: 'daily', time: '09:01' } }], { endBehavior: 'stop' });
  const result = simulate(p, ctx, T0 + 6 * HOUR, { collectFromMs: T0 + 10 * S, maxSpans: 3 });
  assert.equal(result.spans.length, 3);
  assert.equal(result.spans[0].entry.id, 'a');
  assert.ok(result.spans[0].toMs > T0 + 10 * S);
  for (let i = 1; i < result.spans.length; i++) assert.equal(result.spans[i].fromMs, result.spans[i - 1].toMs);
});
