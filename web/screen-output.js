'use strict';

// Saída efetiva de uma tela: override → programa (fila de sessões) → rota legada → ocioso.
// Especificação: docs/FBS_SESSION_ORCHESTRATION.md §2. Puro sobre o documento do banco.

const { createHash } = require('node:crypto');
const core = require('./public/fbs-core');
const { simulate, nextTriggerAt } = require('./orchestrator');
const { playlistOutput, playlistPosition, resolveScreen } = require('./engine');

const PLAN_HORIZON_MS = 6 * 60 * 60 * 1000;
const PLAN_QUANTUM_MS = 10 * 60 * 1000;
const MAX_SEGMENTS = 128;

const own = (collection, id) => (typeof id === 'string' && Object.hasOwn(collection, id) ? collection[id] : null);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function passesOf(repeat) {
  if (!repeat || repeat.mode === 'once') return 1;
  if (repeat.mode === 'count') return repeat.count;
  return null;
}

function contextFor(db, spaceId) {
  return { itemsOf: id => { const playlist = own(db.playlists, id); return playlist && playlist.spaceId === spaceId ? playlist.items : null; } };
}

// Override ativo (ou null). Expira sozinho ao fim das passagens ou no próximo gatilho.
function activeOverride(db, screen, now) {
  const override = screen.override;
  if (!override) return null;
  const playlist = own(db.playlists, override.playlistId);
  if (!playlist || playlist.spaceId !== screen.spaceId || !playlist.items.length) return null;
  if (override.paused) return { override, playlist, endMs: Infinity };
  const passes = passesOf(override.repeat);
  let endMs = passes ? override.startedAtMs + core.totalDuration(playlist.items) * passes : Infinity;
  if (override.until === 'next-trigger' && screen.program?.enabled) {
    const trigger = nextTriggerAt(screen.program, contextFor(db, screen.spaceId), override.startedAtMs);
    if (trigger !== null) endMs = Math.min(endMs, trigger);
  }
  return now < endMs ? { override, playlist, endMs } : null;
}

function routeSegments(db, screen, from, to, now, visited) {
  const input = screen.input;
  if (!input) return [{ kind: 'idle', fromMs: from, toMs: to, origin: 'route', key: 'idle', controller: screen.id }];
  if (input.kind === 'screen') {
    const upstream = own(db.screens, input.id);
    if (!upstream || upstream.spaceId !== screen.spaceId) return [{ kind: 'idle', fromMs: from, toMs: to, origin: 'route', key: 'idle', controller: screen.id }];
    return screenSegments(db, upstream, from, to, now, visited);
  }
  const playlist = own(db.playlists, input.id);
  if (!playlist || playlist.spaceId !== screen.spaceId) return [{ kind: 'idle', fromMs: from, toMs: to, origin: 'route', key: 'idle', controller: screen.id }];
  const transport = playlist.transport || {};
  const mode = ['blackout', 'logo'].includes(transport.mode) ? transport.mode : 'media';
  return [{
    kind: mode, fromMs: from, toMs: to, origin: 'route', playlistId: playlist.id, key: `route:${playlist.id}`,
    offsetAtFromMs: playlistPosition(playlist, from), playing: Boolean(transport.playing), passes: playlist.loop ? null : 1,
    controller: screen.id,
  }];
}

// Segmentos [fromMs,toMs) que cobrem a tela a partir de `from`. toMs null = sem fim conhecido.
function screenSegments(db, screen, from, to, now, visited = new Set()) {
  if (visited.has(screen.id)) return [{ kind: 'idle', fromMs: from, toMs: to, origin: 'route', key: 'cycle', controller: screen.id }];
  visited = new Set(visited).add(screen.id);
  const segments = [];
  let cursor = from;
  const active = activeOverride(db, screen, Math.max(now, from));
  if (active) {
    const { override, playlist } = active;
    const end = Math.min(active.endMs, to ?? Infinity);
    segments.push({
      kind: 'media', origin: 'override', playlistId: playlist.id, key: `o:${override.key}`, controller: screen.id,
      fromMs: override.paused ? from : override.startedAtMs, toMs: Number.isFinite(end) ? end : null,
      offsetAtFromMs: override.paused ? override.pausedOffsetMs : 0, playing: !override.paused, passes: passesOf(override.repeat),
    });
    if (!Number.isFinite(end) || (to !== null && end >= to)) return segments;
    cursor = end;
  }
  const program = screen.program;
  if (!program?.enabled) return segments.concat(routeSegments(db, screen, cursor, to, now, visited));
  const until = to ?? cursor;
  const result = simulate(program, contextFor(db, screen.spaceId), until, { collectFromMs: cursor, maxSpans: MAX_SEGMENTS });
  if (result.status === 'error') {
    segments.push({ kind: 'idle', fromMs: cursor, toMs: to, origin: 'program', key: 'error', error: result.error, controller: screen.id });
    return segments;
  }
  for (const span of result.spans) {
    const spanFrom = Math.max(span.fromMs, cursor);
    const spanTo = to === null ? span.toMs : span.toMs === null ? to : Math.min(span.toMs, to);
    if (spanTo !== null && spanTo <= spanFrom) continue;
    if (span.cycle) {
      segments.push({
        kind: 'cycle', origin: 'program', keyPrefix: 'p:', controller: screen.id, fromMs: span.fromMs, toMs: spanTo, cycleMs: span.cycleMs,
        steps: span.cycle.map(({ entry, lengthMs }) => ({ playlistId: entry.playlistId, entryId: entry.id, lengthMs,
          passes: passesOf(entry.repeat), required: entry.required })),
      });
    } else if (span.entry) {
      const paused = span.startMs === null;
      segments.push({
        kind: 'media', origin: 'program', playlistId: span.entry.playlistId, entryId: span.entry.id, key: `p:${span.key}`,
        controller: screen.id, required: span.entry.required, fromMs: paused ? spanFrom : span.fromMs, toMs: spanTo,
        offsetAtFromMs: paused ? span.frozenOffsetMs : span.fromMs - span.startMs, playing: !paused,
        passes: passesOf(span.entry.repeat),
      });
    } else if (program.idleOutput === 'route') {
      segments.push(...routeSegments(db, screen, spanFrom, spanTo, now, visited));
    } else {
      segments.push({ kind: program.idleOutput, fromMs: spanFrom, toMs: spanTo, origin: 'program', key: `p:${program.idleOutput}`, controller: screen.id });
    }
  }
  return segments;
}

function segmentAt(segments, t) {
  const found = segments.find(segment => t >= segment.fromMs && (segment.toMs === null || t < segment.toMs)) || null;
  if (!found || found.kind !== 'cycle') return found;
  return { ...core.expandSegment(found, t), controller: found.controller };
}

// Fim da cobertura contínua do plano (pode ser menor que o horizonte se o limite de segmentos for atingido).
function coverageEnd(segments, from, horizon) {
  let end = from;
  for (const segment of segments) {
    if (segment.fromMs > end) break;
    if (segment.toMs === null) return horizon;
    end = Math.max(end, segment.toMs);
  }
  return Math.min(end, horizon);
}

// Sessões que a programação pode alcançar dentro do horizonte (pré-carga além dos segmentos expandidos).
function reachablePlaylists(db, screen, from, to, visited = new Set()) {
  if (!screen || visited.has(screen.id)) return [];
  visited.add(screen.id);
  const ids = [];
  if (screen.override?.playlistId) ids.push(screen.override.playlistId);
  for (const entry of screen.program?.enabled ? screen.program.entries : []) {
    if ((entry.validFromMs == null || entry.validFromMs < to) && (entry.validUntilMs == null || entry.validUntilMs > from)
        && (entry.start.type !== 'at' || (entry.start.atMs >= from && entry.start.atMs < to))) ids.push(entry.playlistId);
  }
  if (screen.input?.kind === 'playlist') ids.push(screen.input.id);
  if (screen.input?.kind === 'screen') ids.push(...reachablePlaylists(db, own(db.screens, screen.input.id), from, to, visited));
  return ids;
}

function numericVersion(value) {
  return (parseInt(hash(value).slice(0, 12), 16) % 9007199254740000) + 1;
}

/* Estado completo de uma tela no instante `now`.
 * Mantém exatamente o comportamento legado quando nenhuma tela da cadeia usa override ou programa. */
function resolveScreenOutput(db, screenId, now) {
  const screen = own(db.screens, screenId);
  if (!screen) return null;
  const legacy = resolveScreen(db, screenId);
  const horizonEndMs = Math.ceil((now + PLAN_HORIZON_MS) / PLAN_QUANTUM_MS) * PLAN_QUANTUM_MS;
  const collectFrom = Math.floor(now / PLAN_QUANTUM_MS) * PLAN_QUANTUM_MS;
  const segments = screenSegments(db, screen, collectFrom, horizonEndMs, now).filter(segment => segment.toMs === null || segment.toMs > collectFrom);
  const current = segmentAt(segments, now);
  const playlist = current?.playlistId ? own(db.playlists, current.playlistId) : null;
  const legacyMode = !current || current.origin === 'route';
  let output;
  let routeVersion;
  let sourceVersion;
  if (legacyMode) {
    output = playlist ? playlistOutput(db, playlist, now) : null;
    routeVersion = legacy.routeVersion;
    sourceVersion = playlist ? playlist.version : null;
  } else {
    const mediaById = Object.fromEntries(playlist ? playlist.items.map(item => [item.mediaId, own(db.media, item.mediaId)]).filter(([, media]) => media) : []);
    output = current.kind === 'idle' ? null : core.segmentOutput(current, playlist, mediaById, now);
    const controller = own(db.screens, current.controller);
    routeVersion = hash([legacy.routeVersion, current.origin, current.key, current.playlistId || null]).slice(0, 24);
    sourceVersion = playlist ? numericVersion([playlist.version, controller?.controlRevision ?? 0, current.key]) : null;
  }
  const playlistIds = [...new Set([
    ...segments.flatMap(segment => (segment.kind === 'cycle' ? segment.steps.map(step => step.playlistId) : [segment.playlistId])),
    ...reachablePlaylists(db, screen, now, horizonEndMs),
  ].filter(id => id && own(db.playlists, id)?.spaceId === screen.spaceId))];
  const playlists = {};
  const media = {};
  for (const id of playlistIds) {
    const entry = own(db.playlists, id);
    if (!entry) continue;
    playlists[id] = { id, version: entry.version, items: entry.items };
    for (const item of entry.items) {
      const record = own(db.media, item.mediaId);
      if (record && !media[record.id]) {
        media[record.id] = { id: record.id, name: record.name, type: record.type, mime: record.mime, size: record.size, sha256: record.sha256 ?? null };
      }
    }
  }
  const plan = {
    horizonEndMs: coverageEnd(segments, collectFrom, horizonEndMs), fallback: screen.program?.fallback ?? 'stream',
    segments: segments.map(({ controller, ...segment }) => segment), playlists, media,
  };
  return {
    screen, source: playlist, output, routeVersion, sourceVersion, sourceId: playlist?.id ?? null,
    origin: current?.origin ?? 'route', entryId: current?.entryId ?? null, required: Boolean(current?.required),
    segmentKey: current?.key ?? null,
    error: current?.error ?? null, plan, planHash: hash(plan).slice(0, 24), mediaIds: new Set(Object.keys(media)),
  };
}

module.exports = { resolveScreenOutput, activeOverride, contextFor, passesOf, PLAN_HORIZON_MS };
