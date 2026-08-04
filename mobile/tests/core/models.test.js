import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMediaRef,
  validatePlaylistItem,
  validateSettings,
  validateRuntimeState,
  detectMediaTypeFromMime,
  detectMediaTypeFromName,
  generateId,
} from '../../www/app/core/models.js';

function makeMediaRef(overrides = {}) {
  return { storage: 'sandbox', relPath: 'library/a.jpg', mime: 'image/jpeg', bytes: 100, ...overrides };
}

function makeItem(overrides = {}) {
  return {
    id: 'item-1',
    media: makeMediaRef(),
    name: 'a.jpg',
    type: 'image',
    duration: 10,
    transition: '',
    fit: 'contain',
    startAt: '',
    ...overrides,
  };
}

test('validateMediaRef aceita um MediaRef válido', () => {
  assert.equal(validateMediaRef(makeMediaRef()), true);
});

test('validateMediaRef rejeita storage diferente de "sandbox"', () => {
  assert.throws(() => validateMediaRef(makeMediaRef({ storage: 'external' })), /storage/);
});

test('validateMediaRef rejeita caminho absoluto do Windows', () => {
  assert.throws(
    () => validateMediaRef(makeMediaRef({ relPath: 'C:\\Users\\foo\\video.mp4' })),
    /caminho absoluto/,
  );
});

test('validateMediaRef rejeita URL file://', () => {
  assert.throws(
    () => validateMediaRef(makeMediaRef({ relPath: 'file:///C:/Users/foo/video.mp4' })),
    /file:\/\//,
  );
});

test('validateMediaRef rejeita relPath com ".."', () => {
  assert.throws(() => validateMediaRef(makeMediaRef({ relPath: '../outside.jpg' })), /\.\./);
});

test('validateMediaRef rejeita bytes negativo ou não inteiro', () => {
  assert.throws(() => validateMediaRef(makeMediaRef({ bytes: -1 })), /bytes/);
  assert.throws(() => validateMediaRef(makeMediaRef({ bytes: 1.5 })), /bytes/);
});

test('validateMediaRef rejeita mime fora de image/* ou video/*', () => {
  assert.throws(() => validateMediaRef(makeMediaRef({ mime: 'application/pdf' })), /mime/);
});

test('validatePlaylistItem aceita um item válido', () => {
  assert.equal(validatePlaylistItem(makeItem()), true);
  assert.equal(validatePlaylistItem(makeItem({ type: 'video', transition: 'fade' })), true);
});

test('validatePlaylistItem rejeita id ausente', () => {
  assert.throws(() => validatePlaylistItem(makeItem({ id: '' })), /id/);
});

test('validatePlaylistItem rejeita type desconhecido', () => {
  assert.throws(() => validatePlaylistItem(makeItem({ type: 'audio' })), /type/);
});

test('validatePlaylistItem rejeita duration negativa', () => {
  assert.throws(() => validatePlaylistItem(makeItem({ duration: -5 })), /duration/);
});

test('validatePlaylistItem rejeita transition desconhecida', () => {
  assert.throws(() => validatePlaylistItem(makeItem({ transition: 'wipe' })), /transition/);
});

test('validatePlaylistItem propaga erro de MediaRef inválido', () => {
  assert.throws(() => validatePlaylistItem(makeItem({ media: { storage: 'external' } })), /MediaRef/);
});

test('validateSettings aceita settings válidas', () => {
  assert.equal(
    validateSettings({ rules: [{ start: '19:00', end: '20:00', transition: 'fade' }], defaultFit: 'contain', loopPlaylist: true }),
    true,
  );
});

test('validateSettings rejeita rules não-array', () => {
  assert.throws(() => validateSettings({ rules: null, defaultFit: 'contain', loopPlaylist: true }), /rules/);
});

test('validateSettings rejeita loopPlaylist não booleano', () => {
  assert.throws(() => validateSettings({ rules: [], defaultFit: 'contain', loopPlaylist: 'yes' }), /loopPlaylist/);
});

test('validateRuntimeState aceita estado válido', () => {
  assert.equal(
    validateRuntimeState({ currentItemId: 'item-1', elapsed: 3.5, isPlaying: true, locked: false, blackout: false, presenting: true }),
    true,
  );
  assert.equal(
    validateRuntimeState({ currentItemId: null, elapsed: 0, isPlaying: false, locked: false, blackout: false, presenting: false }),
    true,
  );
});

test('validateRuntimeState rejeita elapsed negativo', () => {
  assert.throws(
    () => validateRuntimeState({ currentItemId: null, elapsed: -1, isPlaying: false, locked: false, blackout: false, presenting: false }),
    /elapsed/,
  );
});

test('validateRuntimeState rejeita flags booleanas ausentes', () => {
  assert.throws(
    () => validateRuntimeState({ currentItemId: null, elapsed: 0, isPlaying: false, locked: false, blackout: false }),
    /presenting/,
  );
});

test('detectMediaTypeFromMime classifica image/video corretamente', () => {
  assert.equal(detectMediaTypeFromMime('image/png'), 'image');
  assert.equal(detectMediaTypeFromMime('video/mp4'), 'video');
});

test('detectMediaTypeFromMime rejeita mime desconhecido', () => {
  assert.throws(() => detectMediaTypeFromMime('application/pdf'), /não suportado/);
});

test('detectMediaTypeFromName reproduz extType do desktop (mp4/webm = video, resto = imagem)', () => {
  assert.equal(detectMediaTypeFromName('clipe.mp4'), 'video');
  assert.equal(detectMediaTypeFromName('clipe.webm'), 'video');
  assert.equal(detectMediaTypeFromName('foto.jpg'), 'image');
  assert.equal(detectMediaTypeFromName('sem-extensao'), 'image');
});

test('generateId produz strings não vazias e distintas', () => {
  const a = generateId();
  const b = generateId();
  assert.equal(typeof a, 'string');
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});
