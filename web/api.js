'use strict';

const { randomUUID } = require('node:crypto');
const { StudioError } = require('./store');
const { json, readJson } = require('./http-utils');
const { playlistOutput, playlistPosition, resolveScreen, validateRoute } = require('./engine');
const { createSessions } = require('./sessions');

const API = '/api/v1';
const ONLINE_MS = 15000;
const ACK_STATUSES = new Set(['ready', 'playing', 'paused', 'blackout', 'logo', 'idle', 'error']);
const TRANSPORT_ACTIONS = new Set(['play', 'pause', 'seek', 'next', 'previous', 'blackout', 'logo']);

function own(collection, id) {
  return typeof id === 'string' && Object.hasOwn(collection, id) ? collection[id] : undefined;
}

function requireRecord(collection, id, label) {
  const record = own(collection, id);
  if (!record) throw new StudioError(404, `${label} não encontrado.`);
  return record;
}

function requireName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) {
    throw new StudioError(400, 'Use um nome com 1 a 80 caracteres.');
  }
  return name;
}

function isVersion(version) {
  return Number.isSafeInteger(version) && version > 0;
}

function requireVersion(record, version) {
  if (!isVersion(version)) throw new StudioError(400, 'Informe uma versão válida.', 'INVALID_VERSION');
  if (record.version !== version) {
    const error = new StudioError(409, 'Este item foi alterado. Atualize e tente novamente.', 'VERSION_CONFLICT');
    error.details = { version: record.version };
    throw error;
  }
}

function coordinate(value) {
  return Number.isFinite(value) && value >= 0 && value <= 4000;
}

function requireItems(db, spaceId, input) {
  if (!Array.isArray(input) || input.length > 200) {
    throw new StudioError(400, 'Uma sessão pode ter até 200 itens.');
  }
  const ids = new Set();
  return input.map(item => {
    const media = item && own(db.media, item.mediaId);
    if (!media || media.spaceId !== spaceId) {
      throw new StudioError(400, 'Cada mídia precisa pertencer ao espaço da sessão.');
    }
    const durationMs = item.durationMs === undefined ? (media.type === 'image' ? 5000 : 10000) : item.durationMs;
    if (!Number.isInteger(durationMs) || durationMs < 1000 || durationMs > 86400000) {
      throw new StudioError(400, 'A duração de cada item deve estar entre 1 segundo e 24 horas.');
    }
    const id = item.id === undefined ? randomUUID() : item.id;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || ids.has(id)) {
      throw new StudioError(400, 'Identificador de item inválido ou repetido.');
    }
    ids.add(id);
    return { id, mediaId: media.id, durationMs };
  });
}

function itemStart(items, index) {
  return items.slice(0, index).reduce((total, item) => total + item.durationMs, 0);
}

function advanceTransport(db, playlist, body, now) {
  const { action, itemId, positionMs } = body;
  if (!TRANSPORT_ACTIONS.has(action)) throw new StudioError(400, 'Comando de reprodução inválido.');
  const transport = { ...playlist.transport, positionMs: playlistPosition(playlist, now), anchorAtMs: now };
  switch (action) {
    case 'play': {
      if (itemId !== undefined) {
        const index = playlist.items.findIndex(item => item.id === itemId);
        if (index === -1) throw new StudioError(400, 'O item selecionado não está na sessão.');
        transport.positionMs = itemStart(playlist.items, index);
      }
      transport.playing = true;
      break;
    }
    case 'pause':
      transport.playing = false;
      break;
    case 'seek': {
      if (!Number.isFinite(positionMs) || positionMs < 0) {
        throw new StudioError(400, 'Informe uma posição de reprodução válida.');
      }
      const totalMs = itemStart(playlist.items, playlist.items.length);
      transport.positionMs = playlist.loop && totalMs ? positionMs % totalMs : Math.min(positionMs, totalMs);
      break;
    }
    case 'next':
    case 'previous': {
      const { currentIndex } = playlistOutput(db, playlist, now);
      const count = playlist.items.length;
      if (count) {
        let index = currentIndex + (action === 'next' ? 1 : -1);
        if (playlist.loop) index = (index + count) % count;
        if (index >= 0 && index < count) transport.positionMs = itemStart(playlist.items, index);
      }
      break;
    }
    case 'blackout':
    case 'logo':
      transport.mode = transport.mode === action ? 'media' : action;
      break;
  }
  return transport;
}

function disconnectInputs(db, kind, id) {
  for (const node of Object.values(db.screens)) {
    if (node.input?.kind === kind && node.input.id === id) {
      node.input = null;
      node.version += 1;
      node.routeRevision += 1;
    }
  }
}

function createApi({ store, publicOrigin, secureCookies, sessions: sharedSessions }) {
  const sessions = sharedSessions || createSessions({ store, publicOrigin, secureCookies });
  const { authorize, csrf } = sessions;
  const presence = new Map();

  function markSeen(screenId, now, ack) {
    const previous = presence.get(screenId);
    const recentAck = previous && now - previous.lastSeenAt < ONLINE_MS ? previous.ack : null;
    presence.set(screenId, { lastSeenAt: now, ack: ack ?? recentAck });
  }

  function screenForOperator(db, screen, now) {
    const route = resolveScreen(db, screen.id);
    const activity = presence.get(screen.id);
    const online = Boolean(activity && now - activity.lastSeenAt < ONLINE_MS);
    const playlistVersion = own(db.playlists, route.sourceId)?.version ?? null;
    const lastAck = activity?.ack;
    const ack = online && lastAck?.routeVersion === route.routeVersion && lastAck.playlistVersion === playlistVersion
      ? lastAck : null;
    let status = 'waiting';
    if (online) {
      if (ack && ack.status !== 'ready') status = ack.status;
      else status = route.sourceId ? 'syncing' : 'idle';
    }
    return { ...screen, ...route, online, lastSeenAt: activity?.lastSeenAt ?? null, status, ack };
  }

  async function operatorChange(req, mutate, withBody = true) {
    csrf(req, authorize(req, 'operator'));
    const body = withBody ? await readJson(req) : undefined;
    return store.change(db => {
      authorize(req, 'operator', db);
      return mutate(db, body);
    });
  }

  async function handler(req, res, url) {
    if (!sharedSessions && await sessions.handle(req, res, url)) return true;
    const { pathname, searchParams } = url;
    if (!pathname.startsWith(`${API}/`)) return false;
    const method = req.method;

    if (method === 'GET' && pathname === `${API}/state`) {
      const role = searchParams.get('role') === 'screen' ? 'screen' : 'operator';
      const session = authorize(req, role);
      const db = store.db;
      const now = store.now();
      const common = { role, csrf: session.csrf, revision: db.revision, serverNowMs: now };
      if (role === 'screen') {
        const { id, name } = db.screens[session.screenId];
        markSeen(id, now);
        const route = resolveScreen(db, id);
        const source = own(db.playlists, route.sourceId) ?? null;
        const output = source ? playlistOutput(db, source, now) : null;
        json(res, 200, { ...common, screen: { id, name, routeVersion: route.routeVersion, sourceId: route.sourceId }, source, output });
      } else {
        const spaces = Object.values(db.spaces);
        const requested = searchParams.get('spaceId');
        const spaceId = requested ? requireRecord(db.spaces, requested, 'Espaço').id : spaces[0]?.id ?? null;
        const inSpace = item => item.spaceId === spaceId;
        const pairings = Object.values(db.pairings).filter(entry => !entry.screenId && !entry.claimed && entry.expiresAt > now)
          .map(({ id, code, name, expiresAt }) => ({ id, code, name, expiresAt }));
        json(res, 200, {
          ...common, spaces, spaceId, pairings,
          playlists: Object.values(db.playlists).filter(inSpace),
          screens: Object.values(db.screens).filter(inSpace).map(screen => screenForOperator(db, screen, now)),
          media: Object.values(db.media).filter(inSpace),
        });
      }
      return true;
    }

    if (method === 'POST' && pathname === `${API}/spaces`) {
      const space = await operatorChange(req, (db, { name }) => {
        const created = { id: randomUUID(), name: requireName(name), createdAt: store.now() };
        db.spaces[created.id] = created;
        return created;
      });
      json(res, 201, space);
      return true;
    }

    if (method === 'POST' && pathname === `${API}/playlists`) {
      const playlist = await operatorChange(req, (db, { spaceId, name }) => {
        requireRecord(db.spaces, spaceId, 'Espaço');
        const count = Object.values(db.playlists).filter(node => node.spaceId === spaceId).length;
        const created = {
          id: randomUUID(), spaceId, name: requireName(name), version: 1, items: [], loop: true,
          position: { x: 32, y: Math.min(4000, 45 + count * 110) },
          transport: { playing: false, positionMs: 0, anchorAtMs: store.now(), mode: 'media' },
        };
        db.playlists[created.id] = created;
        return created;
      });
      json(res, 201, playlist);
      return true;
    }

    const playlistPath = /^\/api\/v1\/playlists\/([^/]+)(\/transport)?$/.exec(pathname);
    if (method === 'PUT' && playlistPath && !playlistPath[2]) {
      const playlist = await operatorChange(req, (db, body) => {
        const current = requireRecord(db.playlists, playlistPath[1], 'Sessão');
        requireVersion(current, body.version);
        if (body.name !== undefined) current.name = requireName(body.name);
        if (body.items !== undefined || body.loop !== undefined) {
          const now = store.now();
          const positionMs = playlistPosition(current, now);
          if (body.items !== undefined) current.items = requireItems(db, current.spaceId, body.items);
          if (body.loop !== undefined) {
            if (typeof body.loop !== 'boolean') throw new StudioError(400, 'A repetição deve ser verdadeira ou falsa.');
            current.loop = body.loop;
          }
          const durationMs = itemStart(current.items, current.items.length);
          current.transport.positionMs = current.loop && durationMs ? positionMs % durationMs : Math.min(positionMs, durationMs);
          current.transport.anchorAtMs = now;
        }
        current.version += 1;
        return current;
      });
      json(res, 200, playlist);
      return true;
    }

    if (method === 'POST' && playlistPath?.[2]) {
      const playlist = await operatorChange(req, (db, body) => {
        const current = requireRecord(db.playlists, playlistPath[1], 'Sessão');
        if (body.version !== undefined) requireVersion(current, body.version);
        current.transport = advanceTransport(db, current, body, store.now());
        current.version += 1;
        return current;
      });
      json(res, 200, playlist);
      return true;
    }

    if (method === 'DELETE' && playlistPath && !playlistPath[2]) {
      await operatorChange(req, db => {
        const { id } = requireRecord(db.playlists, playlistPath[1], 'Sessão');
        disconnectInputs(db, 'playlist', id);
        delete db.playlists[id];
      }, false);
      json(res, 200, { ok: true });
      return true;
    }

    if (method === 'POST' && pathname === `${API}/screens/self/ack`) {
      csrf(req, authorize(req, 'screen'));
      const { routeVersion, playlistVersion, status, mediaId, message } = await readJson(req);
      const session = authorize(req, 'screen');
      if (typeof routeVersion !== 'string' || !routeVersion || routeVersion.length > 128
          || (playlistVersion !== null && !isVersion(playlistVersion)) || !ACK_STATUSES.has(status)
          || (mediaId != null && typeof mediaId !== 'string')
          || (message !== undefined && (typeof message !== 'string' || message.length > 240))) {
        throw new StudioError(400, 'Confirmação de reprodução inválida.');
      }
      const db = store.db;
      const route = resolveScreen(db, session.screenId);
      const playlist = own(db.playlists, route.sourceId);
      const currentVersion = playlist?.version ?? null;
      const now = store.now();
      if (routeVersion !== route.routeVersion || playlistVersion !== currentVersion
          || (mediaId != null && !playlist?.items.some(item => item.mediaId === mediaId))) {
        markSeen(session.screenId, now);
        const error = new StudioError(409, 'A tela recebeu uma versão antiga da origem.', 'STALE_ACK');
        error.details = { routeVersion: route.routeVersion, playlistVersion: currentVersion };
        throw error;
      }
      const ack = { routeVersion, playlistVersion, status, at: now };
      if (mediaId != null) ack.mediaId = mediaId;
      if (message !== undefined) ack.message = message;
      markSeen(session.screenId, now, ack);
      json(res, 200, { ok: true });
      return true;
    }

    const screenPath = /^\/api\/v1\/screens\/([^/]+)(\/route)?$/.exec(pathname);
    if (method === 'PUT' && screenPath?.[2]) {
      const screen = await operatorChange(req, (db, { version, input }) => {
        const current = requireRecord(db.screens, screenPath[1], 'Tela');
        requireVersion(current, version);
        validateRoute(db, current.id, input);
        current.input = input === null ? null : { kind: input.kind, id: input.id };
        current.version += 1;
        current.routeRevision += 1;
        return current;
      });
      json(res, 200, screen);
      return true;
    }

    if (method === 'PATCH' && screenPath && !screenPath[2]) {
      const screen = await operatorChange(req, (db, { version, name }) => {
        const current = requireRecord(db.screens, screenPath[1], 'Tela');
        requireVersion(current, version);
        current.name = requireName(name);
        current.version += 1;
        return current;
      });
      json(res, 200, screen);
      return true;
    }

    if (method === 'DELETE' && screenPath && !screenPath[2]) {
      const id = await operatorChange(req, db => {
        const screen = requireRecord(db.screens, screenPath[1], 'Tela');
        for (const session of Object.values(db.sessions)) {
          if (session.role === 'screen' && session.screenId === screen.id) delete db.sessions[session.id];
        }
        disconnectInputs(db, 'screen', screen.id);
        delete db.screens[screen.id];
        return screen.id;
      }, false);
      presence.delete(id);
      json(res, 200, { ok: true });
      return true;
    }

    const positionPath = /^\/api\/v1\/nodes\/(playlists|screens)\/([^/]+)\/position$/.exec(pathname);
    if (method === 'PATCH' && positionPath) {
      const [, kind, id] = positionPath;
      const node = await operatorChange(req, (db, { version, x, y }) => {
        const current = requireRecord(db[kind], id, 'Nó');
        requireVersion(current, version);
        if (!coordinate(x) || !coordinate(y)) throw new StudioError(400, 'A posição deve estar entre 0 e 4000.');
        current.position = { x, y };
        current.version += 1;
        return current;
      });
      json(res, 200, node);
      return true;
    }

    return false;
  }

  handler.presence = presence;
  handler.close = () => {
    presence.clear();
    if (!sharedSessions) sessions.close();
  };
  return handler;
}

module.exports = { createApi };
