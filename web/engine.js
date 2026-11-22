'use strict';

const { createHash } = require('node:crypto');
const { StudioError } = require('./store');
const own = (collection, id) => typeof id === 'string' && Object.hasOwn(collection, id) ? collection[id] : null;
const duration = item => Number.isFinite(item.durationMs) && item.durationMs > 0 ? item.durationMs : 1000;
const totalDuration = playlist => (playlist.items || []).reduce((sum, item) => sum + duration(item), 0);

function validateRoute(db, screenId, input) {
  const screen = own(db.screens, screenId);
  if (!screen) throw new StudioError(400, 'A tela não existe.', 'SCREEN_NOT_FOUND');
  if (input === null) return;
  if (!input || !['playlist', 'screen'].includes(input.kind) || typeof input.id !== 'string') {
    throw new StudioError(400, 'Escolha uma sessão ou uma tela como origem.', 'INVALID_ROUTE');
  }
  const seen = new Set([screenId]);
  let current = input;
  while (current) {
    const source = own(current.kind === 'screen' ? db.screens : db.playlists, current.id);
    if (!source || source.spaceId !== screen.spaceId) {
      throw new StudioError(400, 'A origem deve existir no mesmo espaço.', 'INVALID_SOURCE');
    }
    if (current.kind === 'playlist') return;
    if (seen.has(source.id)) throw new StudioError(409, 'Esta ligação criaria um ciclo entre telas.', 'ROUTE_CYCLE');
    seen.add(source.id);
    current = source.input;
    if (current && !['screen', 'playlist'].includes(current.kind)) {
      throw new StudioError(400, 'A cadeia de telas contém uma origem inválida.', 'INVALID_ROUTE');
    }
  }
}

function resolveScreen(db, screenId) {
  const visited = new Set();
  const chain = [];
  let screen = own(db.screens, screenId);
  const spaceId = screen?.spaceId;
  let sourceId = null;
  while (screen && screen.spaceId === spaceId && !visited.has(screen.id)) {
    visited.add(screen.id);
    chain.push([screen.id, screen.routeRevision]);
    if (!screen.input) break;
    if (screen.input.kind === 'playlist') {
      const playlist = own(db.playlists, screen.input.id);
      if (playlist?.spaceId === spaceId) sourceId = playlist.id;
      break;
    }
    if (screen.input.kind !== 'screen') break;
    screen = own(db.screens, screen.input.id);
  }
  chain.push(sourceId);
  return { sourceId, routeVersion: createHash('sha256').update(JSON.stringify(chain)).digest('hex').slice(0, 24) };
}

function playlistPosition(playlist, now) {
  const total = totalDuration(playlist);
  const transport = playlist.transport || {};
  let position = Math.max(0, Number(transport.positionMs) || 0);
  if (transport.playing) position += Math.max(0, now - (Number.isFinite(transport.anchorAtMs) ? transport.anchorAtMs : now));
  if (!total) return 0;
  return playlist.loop ? position % total : Math.min(position, total);
}

function playlistOutput(db, playlist, now) {
  const items = playlist.items || [];
  const totalMs = totalDuration(playlist);
  const absolute = playlistPosition(playlist, now);
  let currentIndex = -1;
  let offset = absolute;
  for (let i = 0; i < items.length; i++) {
    if (offset < duration(items[i]) || i === items.length - 1) { currentIndex = i; break; }
    offset -= duration(items[i]);
  }
  const selected = items[currentIndex];
  const media = selected && own(db.media, selected.mediaId);
  const mode = ['blackout', 'logo'].includes(playlist.transport?.mode) ? playlist.transport.mode : 'media';
  return {
    mode,
    item: media ? { id: selected.id, mediaId: media.id, name: media.name, type: media.type, mime: media.mime,
      url: `/api/v1/media/${media.id}?role=screen`, durationMs: duration(selected) } : null,
    positionMs: Math.max(0, selected ? Math.min(offset, duration(selected)) : 0),
    playing: Boolean(playlist.transport?.playing && totalMs && (playlist.loop || absolute < totalMs)),
    totalMs,
    currentIndex,
  };
}

module.exports = { resolveScreen, validateRoute, playlistPosition, playlistOutput };
