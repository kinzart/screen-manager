'use strict';

// Edição da fila de sessões e comandos remotos por tela (todos dentro de store.change).
// Cada mudança rebaseia o cursor no estado resolvido em `now`, então a linha do tempo nunca é reescrita para trás.

const { randomUUID } = require('node:crypto');
const { StudioError } = require('./store');
const core = require('./public/fbs-core');
const {
  ProgramError, validateProgram, resolveProgram, rebaseCursor, startCursor, neighborEntry,
} = require('./orchestrator');
const { activeOverride, contextFor, passesOf } = require('./screen-output');

const COMMAND_HISTORY = 20;
const SESSION_ACTIONS = new Set(['play', 'pause', 'stop', 'restart', 'next-session', 'previous-session', 'start-entry']);
const MEDIA_ACTIONS = new Set(['next-item', 'previous-item']);
const OVERRIDE_ACTIONS = new Set(['take', 'release']);
const COMMAND_ID = /^[A-Za-z0-9_-]{8,100}$/;

const own = (collection, id) => (typeof id === 'string' && Object.hasOwn(collection, id) ? collection[id] : null);

function asStudioError(error) {
  if (error instanceof ProgramError) return new StudioError(400, error.message, error.code);
  return error;
}

function stoppedCursor(now) {
  return { atMs: now, entryId: null, key: null, offsetMs: 0, pending: null, paused: false };
}

function createScreenControl({ store }) {
  function programState(db, screen, now) {
    const program = screen.program;
    if (!program) return null;
    const state = resolveProgram(program, contextFor(db, screen.spaceId), now);
    const override = activeOverride(db, screen, now);
    return {
      enabled: program.enabled, status: program.enabled ? state.status : 'disabled', error: state.error ?? null,
      entryId: state.entry?.id ?? null, offsetMs: state.offsetMs ?? 0, nextChangeMs: state.nextChangeMs ?? null,
      pending: state.pending ?? null,
      override: override ? { playlistId: override.playlist.id, until: override.override.until, paused: Boolean(override.override.paused),
        endMs: Number.isFinite(override.endMs) ? override.endMs : null } : null,
    };
  }

  // Ajusta o cursor do programa antigo para as entradas novas, preservando a posição em tempo de parede.
  function remapCursor(previous, next, ctx, now) {
    const base = previous ? rebaseCursor(previous, ctx, now) : null;
    if (!base) return startCursor(next, ctx, now);
    if (base.entryId === null) return { ...base, atMs: now, pending: null };
    const kept = next.entries.find(entry => entry.id === base.entryId);
    const pending = base.pending && next.entries.some(entry => entry.id === base.pending.entryId) ? base.pending : null;
    if (kept && kept.playlistId === previous.entries.find(entry => entry.id === base.entryId)?.playlistId) {
      return { ...base, pending };
    }
    // Entrada removida ou trocada de sessão: segue para a próxima sequencial a partir da posição antiga.
    const oldIndex = previous.entries.findIndex(entry => entry.id === base.entryId);
    const ids = new Set(next.entries.map(entry => entry.id));
    const survivor = previous.entries.slice(0, Math.max(0, oldIndex)).reverse().find(entry => ids.has(entry.id));
    const following = neighborEntry(next, ctx, survivor ? survivor.id : null, 1, now);
    return following ? { ...startCursor(next, ctx, now, following.id), pending } : stoppedCursor(now);
  }

  function setProgram(db, screen, input, now) {
    const ctx = contextFor(db, screen.spaceId);
    if (input === null) {
      screen.program = null;
      return;
    }
    let normalized;
    try {
      normalized = validateProgram(input, {
        playlistExists: id => own(db.playlists, id)?.spaceId === screen.spaceId,
        makeId: () => randomUUID(),
      });
    } catch (error) { throw asStudioError(error); }
    normalized.cursor = input.restart === true || !screen.program
      ? startCursor(normalized, ctx, now)
      : remapCursor(screen.program, normalized, ctx, now);
    if (screen.program?.cursor?.paused && input.restart !== true) normalized.cursor.paused = true;
    screen.program = normalized;
  }

  // Antes de mudar a duração de uma sessão, fixa o cursor de todo programa que a usa (não reescreve o passado).
  function freezeProgramsUsing(db, playlistId, now) {
    for (const screen of Object.values(db.screens)) {
      const program = screen.program;
      if (program?.cursor && program.entries.some(entry => entry.playlistId === playlistId)) {
        program.cursor = rebaseCursor(program, contextFor(db, screen.spaceId), now);
      }
    }
  }

  function detachPlaylist(db, playlistId, now) {
    for (const screen of Object.values(db.screens)) {
      let changed = false;
      if (screen.override?.playlistId === playlistId) { screen.override = null; changed = true; }
      const program = screen.program;
      if (program && program.entries.some(entry => entry.playlistId === playlistId)) {
        const ctx = contextFor(db, screen.spaceId);
        const next = { ...program, entries: program.entries.filter(entry => entry.playlistId !== playlistId) };
        next.cursor = remapCursor(program, next, ctx, now);
        screen.program = next;
        changed = true;
      }
      if (changed) { screen.version += 1; screen.controlRevision = (screen.controlRevision ?? 0) + 1; }
    }
  }

  function mediaStep(items, offsetMs, passes, direction) {
    const position = core.sequenceAt(items, offsetMs, passes);
    if (position.index < 0) return offsetMs;
    const duration = core.itemDuration(items[position.index]);
    if (direction > 0) return position.itemStartMs + duration;
    if (position.itemOffsetMs > 2000) return position.itemStartMs;
    const previous = items[(position.index - 1 + items.length) % items.length];
    return Math.max(0, position.itemStartMs - core.itemDuration(previous));
  }

  function applyCommand(db, screen, body, now) {
    const { action } = body;
    const ctx = contextFor(db, screen.spaceId);
    const program = screen.program?.enabled ? screen.program : null;
    const override = activeOverride(db, screen, now);
    if (OVERRIDE_ACTIONS.has(action)) {
      if (action === 'release') { screen.override = null; return; }
      const playlist = own(db.playlists, body.playlistId);
      if (!playlist || playlist.spaceId !== screen.spaceId || !playlist.items.length) {
        throw new StudioError(400, 'Escolha uma sessão com itens neste espaço.', 'INVALID_SESSION');
      }
      const until = body.until === undefined ? 'manual' : body.until;
      if (!['manual', 'next-trigger'].includes(until)) throw new StudioError(400, 'Duração do controle manual inválida.', 'INVALID_COMMAND');
      const repeat = body.repeat === undefined ? { mode: 'loop' } : body.repeat;
      if (!repeat || !['once', 'count', 'loop'].includes(repeat.mode)
          || (repeat.mode === 'count' && (!Number.isInteger(repeat.count) || repeat.count < 1 || repeat.count > 1000))) {
        throw new StudioError(400, 'Repetição inválida.', 'INVALID_COMMAND');
      }
      screen.override = { playlistId: playlist.id, startedAtMs: now, until, repeat: repeat.mode === 'count' ? { mode: 'count', count: repeat.count } : { mode: repeat.mode },
        key: `${now}-${randomUUID().slice(0, 8)}`, paused: false };
      return;
    }
    if (override && (action === 'pause' || action === 'play' || MEDIA_ACTIONS.has(action))) {
      const current = screen.override;
      const offset = current.paused ? current.pausedOffsetMs : now - current.startedAtMs;
      if (action === 'pause' && !current.paused) Object.assign(current, { paused: true, pausedOffsetMs: offset });
      else if (action === 'play' && current.paused) Object.assign(current, { paused: false, startedAtMs: now - offset, pausedOffsetMs: undefined });
      else if (MEDIA_ACTIONS.has(action)) {
        const target = mediaStep(override.playlist.items, offset, passesOf(current.repeat), action === 'next-item' ? 1 : -1);
        if (current.paused) current.pausedOffsetMs = target;
        else current.startedAtMs = now - target;
      }
      return;
    }
    if (!program) {
      throw new StudioError(409, 'Esta tela não tem programação ativa. Use o controle da sessão ou assuma uma sessão.', 'NO_SCREEN_CONTROL');
    }
    if (SESSION_ACTIONS.has(action) || MEDIA_ACTIONS.has(action)) screen.override = null;
    const cursor = program.cursor;
    const commandKey = `k${now}-${randomUUID().slice(0, 8)}`;
    switch (action) {
      case 'play': {
        if (cursor.paused) program.cursor = { ...cursor, atMs: now, paused: false };
        else if (resolveProgram(program, ctx, now).status === 'stopped') program.cursor = { ...startCursor(program, ctx, now), key: commandKey };
        return;
      }
      case 'pause': {
        if (!cursor.paused) program.cursor = { ...rebaseCursor(program, ctx, now), paused: true };
        return;
      }
      case 'stop': program.cursor = stoppedCursor(now); return;
      case 'restart': program.cursor = { ...startCursor(program, ctx, now), key: commandKey }; return;
      case 'start-entry': {
        if (!program.entries.some(entry => entry.id === body.entryId)) throw new StudioError(400, 'Entrada da programação não encontrada.', 'INVALID_COMMAND');
        program.cursor = { ...startCursor(program, ctx, now, body.entryId), key: commandKey };
        return;
      }
      case 'next-session':
      case 'previous-session': {
        const state = resolveProgram(program, ctx, now);
        const target = neighborEntry(program, ctx, state.entry?.id ?? null, action === 'next-session' ? 1 : -1, now);
        program.cursor = target ? { ...startCursor(program, ctx, now, target.id), key: commandKey } : stoppedCursor(now);
        return;
      }
      case 'next-item':
      case 'previous-item': {
        const state = resolveProgram(program, ctx, now);
        if (!state.entry) throw new StudioError(409, 'Nenhuma sessão no ar nesta tela.', 'NOTHING_PLAYING');
        const items = ctx.itemsOf(state.entry.playlistId) || [];
        const target = mediaStep(items, state.offsetMs, passesOf(state.entry.repeat), action === 'next-item' ? 1 : -1);
        const base = cursor.paused ? cursor : rebaseCursor(program, ctx, now);
        program.cursor = { ...base, atMs: now, offsetMs: target };
        return;
      }
      default:
        throw new StudioError(400, 'Comando inválido.', 'INVALID_COMMAND');
    }
  }

  // Idempotente por commandId: repetir devolve o registro original sem reaplicar.
  function command(db, screen, body, now) {
    if (!body || typeof body.commandId !== 'string' || !COMMAND_ID.test(body.commandId)) {
      throw new StudioError(400, 'Informe um commandId válido.', 'INVALID_COMMAND');
    }
    screen.commands ??= [];
    const existing = screen.commands.find(record => record.id === body.commandId);
    if (existing) return { record: existing, duplicate: true };
    if (typeof body.action !== 'string' || !(SESSION_ACTIONS.has(body.action) || MEDIA_ACTIONS.has(body.action) || OVERRIDE_ACTIONS.has(body.action))) {
      throw new StudioError(400, 'Comando inválido.', 'INVALID_COMMAND');
    }
    applyCommand(db, screen, body, now);
    screen.controlRevision = (screen.controlRevision ?? 0) + 1;
    const record = { id: body.commandId, action: body.action, at: now, revision: db.revision + 1, result: 'ok' };
    screen.commands = [...screen.commands, record].slice(-COMMAND_HISTORY);
    return { record, duplicate: false };
  }

  return { programState, setProgram, freezeProgramsUsing, detachPlaylist, command };
}

module.exports = { createScreenControl };
