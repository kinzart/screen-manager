// Modelos e validadores do núcleo mobile. Espelham o modelo desktop
// (src/control.js, addFiles linhas 207-229; main.js settings seed linha 16),
// com a mudança essencial: caminho absoluto -> MediaRef (sandbox).
// Núcleo puro: sem Electron, Capacitor ou DOM.

import { TRANSITIONS, normalizeTransition } from './transitions.js';

const MEDIA_TYPES = new Set(['image', 'video']);

function fail(message) {
  throw new Error(message);
}

/**
 * MediaRef — referência a um arquivo copiado para o sandbox do app.
 * { storage: 'sandbox', relPath, mime, bytes }
 * Nunca aceita caminho absoluto do Windows nem URL file:// (decisão humana:
 * mídia é sempre copiada para o sandbox, nunca referenciada por path bruto).
 */
export function validateMediaRef(media) {
  if (!media || typeof media !== 'object') fail('MediaRef inválido: objeto esperado');
  if (media.storage !== 'sandbox') fail('MediaRef inválido: storage deve ser "sandbox"');
  if (typeof media.relPath !== 'string' || media.relPath.length === 0) {
    fail('MediaRef inválido: relPath obrigatório');
  }
  if (/^[A-Za-z]:[\\/]/.test(media.relPath)) {
    fail('MediaRef inválido: relPath não pode ser caminho absoluto do Windows');
  }
  if (media.relPath.startsWith('/') || media.relPath.startsWith('\\')) {
    fail('MediaRef inválido: relPath não pode ser caminho absoluto');
  }
  if (media.relPath.startsWith('file://')) {
    fail('MediaRef inválido: relPath não pode ser uma URL file://');
  }
  if (media.relPath.split(/[\\/]/).includes('..')) {
    fail('MediaRef inválido: relPath não pode conter ".."');
  }
  if (typeof media.mime !== 'string' || !/^(image|video)\//.test(media.mime)) {
    fail('MediaRef inválido: mime deve começar com "image/" ou "video/"');
  }
  if (!Number.isInteger(media.bytes) || media.bytes < 0) {
    fail('MediaRef inválido: bytes deve ser um inteiro não negativo');
  }
  return true;
}

/**
 * PlaylistItem — item de playlist mobile.
 * { id, media, name, type, duration, transition, fit, startAt }
 */
export function validatePlaylistItem(item) {
  if (!item || typeof item !== 'object') fail('PlaylistItem inválido: objeto esperado');
  if (typeof item.id !== 'string' || item.id.length === 0) {
    fail('PlaylistItem inválido: id obrigatório (string não vazia)');
  }
  validateMediaRef(item.media);
  if (typeof item.name !== 'string' || item.name.length === 0) {
    fail('PlaylistItem inválido: name obrigatório');
  }
  if (!MEDIA_TYPES.has(item.type)) {
    fail('PlaylistItem inválido: type deve ser "image" ou "video"');
  }
  if (typeof item.duration !== 'number' || !Number.isFinite(item.duration) || item.duration < 0) {
    fail('PlaylistItem inválido: duration deve ser um número >= 0');
  }
  if (item.transition !== '' && item.transition !== undefined && !TRANSITIONS.includes(item.transition)) {
    fail(`PlaylistItem inválido: transition deve ser "" ou uma de ${TRANSITIONS.join(', ')}`);
  }
  if (item.fit !== undefined && (typeof item.fit !== 'string' || item.fit.length === 0)) {
    fail('PlaylistItem inválido: fit deve ser uma string não vazia quando presente');
  }
  if (item.startAt !== undefined && typeof item.startAt !== 'string') {
    fail('PlaylistItem inválido: startAt deve ser string (ex.: "HH:MM:SS" ou "")');
  }
  if (item.displayName !== undefined && typeof item.displayName !== 'string') {
    fail('PlaylistItem inválido: displayName deve ser string quando presente');
  }
  return true;
}

/**
 * Nome amigável exibido ao usuário — NUNCA o id interno (uid()/generateId(),
 * usado só como chave técnica) nem o relPath sandbox. Ordem: displayName
 * (definido pelo usuário) → name (nome original do arquivo) → fallback
 * curto derivado da extensão, nunca um UUID completo.
 */
export function displayNameFor(item) {
  if (!item || typeof item !== 'object') return 'Mídia';
  if (typeof item.displayName === 'string' && item.displayName.trim()) return item.displayName.trim();
  if (typeof item.name === 'string' && item.name.trim()) return item.name.trim();
  const ext = typeof item.media?.mime === 'string' && item.media.mime.includes('/')
    ? item.media.mime.split('/')[1]
    : 'arquivo';
  return `Mídia (${ext})`;
}

/** Posições válidas para o logo sobreposto na apresentação. */
export const LOGO_POSITIONS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']);

/** Configuração padrão do logo — desativado até o usuário importar um. */
export const DEFAULT_LOGO_SETTINGS = Object.freeze({
  enabled: false,
  media: null,
  position: 'bottom-right',
  size: 20,
  opacity: 100,
  margin: 16,
  keepAspect: true,
});

/** Valida a sub-config de logo dentro de Settings. Permissivo: aceita ausência (usa defaults). */
export function validateLogoSettings(logo) {
  if (logo === undefined || logo === null) return true;
  if (typeof logo !== 'object') fail('Settings.logo inválido: objeto esperado');
  if (logo.enabled !== undefined && typeof logo.enabled !== 'boolean') fail('Settings.logo.enabled deve ser boolean');
  if (logo.media !== undefined && logo.media !== null) validateMediaRef(logo.media);
  if (logo.position !== undefined && !LOGO_POSITIONS.includes(logo.position)) {
    fail(`Settings.logo.position deve ser uma de ${LOGO_POSITIONS.join(', ')}`);
  }
  for (const key of ['size', 'opacity', 'margin']) {
    if (logo[key] !== undefined && (typeof logo[key] !== 'number' || !Number.isFinite(logo[key]) || logo[key] < 0)) {
      fail(`Settings.logo.${key} deve ser um número >= 0`);
    }
  }
  if (logo.keepAspect !== undefined && typeof logo.keepAspect !== 'boolean') fail('Settings.logo.keepAspect deve ser boolean');
  return true;
}

/** Configuração padrão do controle remoto — desativado até o usuário conectar a uma TV. */
export const DEFAULT_REMOTE_SETTINGS = Object.freeze({ enabled: false, serverUrl: '', room: '', token: '' });

/** Valida a sub-config de controle remoto dentro de Settings. Permissivo: aceita ausência (usa defaults). */
export function validateRemoteSettings(remote) {
  if (remote === undefined || remote === null) return true;
  if (typeof remote !== 'object') fail('Settings.remote inválido: objeto esperado');
  if (remote.enabled !== undefined && typeof remote.enabled !== 'boolean') fail('Settings.remote.enabled deve ser boolean');
  if (remote.serverUrl !== undefined && typeof remote.serverUrl !== 'string') fail('Settings.remote.serverUrl deve ser string');
  if (remote.room !== undefined && typeof remote.room !== 'string') fail('Settings.remote.room deve ser string');
  if (remote.token !== undefined && typeof remote.token !== 'string') fail('Settings.remote.token deve ser string');
  return true;
}

/**
 * Settings — espelha { rules, defaultFit, loopPlaylist } de main.js linha 16.
 */
export function validateSettings(settings) {
  if (!settings || typeof settings !== 'object') fail('Settings inválido: objeto esperado');
  if (!Array.isArray(settings.rules)) fail('Settings inválido: rules deve ser array');
  settings.rules.forEach((rule, index) => {
    if (!rule || typeof rule.start !== 'string' || typeof rule.end !== 'string') {
      fail(`Settings inválido: rules[${index}] deve ter start e end (string)`);
    }
  });
  if (typeof settings.defaultFit !== 'string' || settings.defaultFit.length === 0) {
    fail('Settings inválido: defaultFit obrigatório');
  }
  if (typeof settings.loopPlaylist !== 'boolean') {
    fail('Settings inválido: loopPlaylist deve ser boolean');
  }
  // --- campos opcionais adicionados na v2 (UX mobile) — nunca obrigatórios,
  // para não quebrar Settings já persistidos antes desta etapa. ---
  if (settings.defaultDuration !== undefined) {
    if (typeof settings.defaultDuration !== 'number' || !Number.isFinite(settings.defaultDuration) || settings.defaultDuration < 0) {
      fail('Settings inválido: defaultDuration deve ser um número >= 0');
    }
  }
  if (settings.defaultTransition !== undefined && !TRANSITIONS.includes(settings.defaultTransition) && settings.defaultTransition !== '') {
    fail(`Settings inválido: defaultTransition deve ser "" ou uma de ${TRANSITIONS.join(', ')}`);
  }
  if (settings.autoHideControls !== undefined && typeof settings.autoHideControls !== 'boolean') {
    fail('Settings inválido: autoHideControls deve ser boolean');
  }
  if (settings.hideControlsDelayMs !== undefined) {
    if (typeof settings.hideControlsDelayMs !== 'number' || !Number.isFinite(settings.hideControlsDelayMs) || settings.hideControlsDelayMs < 0) {
      fail('Settings inválido: hideControlsDelayMs deve ser um número >= 0');
    }
  }
  if (settings.showNextItem !== undefined && typeof settings.showNextItem !== 'boolean') {
    fail('Settings inválido: showNextItem deve ser boolean');
  }
  if (settings.showTimer !== undefined && typeof settings.showTimer !== 'boolean') {
    fail('Settings inválido: showTimer deve ser boolean');
  }
  if (settings.logo !== undefined) validateLogoSettings(settings.logo);
  if (settings.remote !== undefined) validateRemoteSettings(settings.remote);
  return true;
}

/**
 * RuntimeState — novo no mobile, para restaurar o app ao reabrir.
 * { currentItemId, elapsed, isPlaying, locked, blackout, presenting }
 */
export function validateRuntimeState(state) {
  if (!state || typeof state !== 'object') fail('RuntimeState inválido: objeto esperado');
  if (state.currentItemId !== null && typeof state.currentItemId !== 'string') {
    fail('RuntimeState inválido: currentItemId deve ser string ou null');
  }
  if (typeof state.elapsed !== 'number' || !Number.isFinite(state.elapsed) || state.elapsed < 0) {
    fail('RuntimeState inválido: elapsed deve ser um número >= 0');
  }
  for (const key of ['isPlaying', 'locked', 'blackout', 'presenting']) {
    if (typeof state[key] !== 'boolean') {
      fail(`RuntimeState inválido: ${key} deve ser boolean`);
    }
  }
  return true;
}

/**
 * Reproduz extType(path) do desktop (src/control.js linha 14), adaptado
 * para o mime type disponível no mobile (mídia é copiada com mime
 * conhecido, não path). Mantida também a variante por nome/extensão para
 * paridade de comportamento com o desktop.
 */
export function detectMediaTypeFromMime(mime) {
  if (typeof mime === 'string' && mime.startsWith('video/')) return 'video';
  if (typeof mime === 'string' && mime.startsWith('image/')) return 'image';
  fail(`detectMediaTypeFromMime: mime não suportado: ${mime}`);
}

export function detectMediaTypeFromName(name) {
  return /\.(mp4|webm)$/i.test(String(name || '')) ? 'video' : 'image';
}

/** Reproduz uid() do desktop (src/control.js linha 33). */
export function generateId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export { normalizeTransition };
