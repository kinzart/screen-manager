import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { PresentationPlatform } from '../../www/app/adapters/PresentationPlatform.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeFakeWakeLock({ fail = false } = {}) {
  const calls = [];
  return {
    calls,
    async request(type) {
      calls.push({ method: 'request', type });
      if (fail) throw new Error('wake lock indisponível neste contexto');
      let released = false;
      return { release: async () => { released = true; }, get released() { return released; } };
    },
  };
}

function makeFakeOrientation({ fail = false } = {}) {
  const calls = [];
  return {
    calls,
    async lock(orientation) {
      calls.push({ method: 'lock', orientation });
      if (fail) throw new Error('orientação bloqueada pelo navegador');
    },
    unlock() {
      calls.push({ method: 'unlock' });
    },
  };
}

function makeFakeFullscreen({ fail = false } = {}) {
  const calls = [];
  return {
    calls,
    async request(el) {
      calls.push({ method: 'request', el });
      if (fail) throw new Error('fullscreen negado pelo usuário');
    },
    async exit() {
      calls.push({ method: 'exit' });
    },
  };
}

// --- Wake Lock ---

test('wake lock: keepAwake() com API disponível marca supported=true', async () => {
  const wakeLock = makeFakeWakeLock();
  const platform = new PresentationPlatform({ wakeLock });
  assert.equal(platform.wakeLockSupported(), true);
  const result = await platform.keepAwake();
  assert.equal(result.supported, true);
  assert.equal(wakeLock.calls[0].type, 'screen');
});

test('wake lock: sem API injetada, wakeLockSupported()=false e keepAwake() não lança', async () => {
  const platform = new PresentationPlatform({});
  assert.equal(platform.wakeLockSupported(), false);
  const result = await platform.keepAwake();
  assert.equal(result.supported, false);
});

test('wake lock: falha real ao solicitar não lança, retorna supported=false com error', async () => {
  const wakeLock = makeFakeWakeLock({ fail: true });
  const platform = new PresentationPlatform({ wakeLock });
  const result = await platform.keepAwake();
  assert.equal(result.supported, false);
  assert.ok(result.error);
});

test('wake lock: allowSleep() libera o sentinel obtido', async () => {
  const wakeLock = makeFakeWakeLock();
  const platform = new PresentationPlatform({ wakeLock });
  await platform.keepAwake();
  await assert.doesNotReject(() => platform.allowSleep());
});

test('wake lock: allowSleep() sem keepAwake() prévio não lança', async () => {
  const platform = new PresentationPlatform({});
  await assert.doesNotReject(() => platform.allowSleep());
});

// --- Orientação ---

test('orientação: lockOrientation() com API disponível marca supported=true', async () => {
  const orientation = makeFakeOrientation();
  const platform = new PresentationPlatform({ orientation });
  assert.equal(platform.orientationSupported(), true);
  const result = await platform.lockOrientation('landscape');
  assert.equal(result.supported, true);
  assert.equal(orientation.calls[0].orientation, 'landscape');
});

test('orientação: sem API injetada, orientationSupported()=false', async () => {
  const platform = new PresentationPlatform({});
  assert.equal(platform.orientationSupported(), false);
  const result = await platform.lockOrientation('landscape');
  assert.equal(result.supported, false);
});

test('orientação: falha real não lança', async () => {
  const orientation = makeFakeOrientation({ fail: true });
  const platform = new PresentationPlatform({ orientation });
  const result = await platform.lockOrientation('portrait');
  assert.equal(result.supported, false);
  assert.ok(result.error);
});

test('orientação: unlockOrientation() chama unlock() quando disponível', () => {
  const orientation = makeFakeOrientation();
  const platform = new PresentationPlatform({ orientation });
  platform.unlockOrientation();
  assert.equal(orientation.calls.some((c) => c.method === 'unlock'), true);
});

// --- Fullscreen ---

test('fullscreen: fullscreenSupported() reflete a disponibilidade real da API injetada', () => {
  assert.equal(new PresentationPlatform({}).fullscreenSupported(), false);
  assert.equal(new PresentationPlatform({ fullscreen: makeFakeFullscreen() }).fullscreenSupported(), true);
});

test('fullscreen: enterFullscreen()/exitFullscreen() atualizam isFullscreen()', async () => {
  const fullscreen = makeFakeFullscreen();
  const platform = new PresentationPlatform({ fullscreen });
  assert.equal(platform.isFullscreen(), false);
  await platform.enterFullscreen({});
  assert.equal(platform.isFullscreen(), true);
  await platform.exitFullscreen();
  assert.equal(platform.isFullscreen(), false);
});

test('fullscreen: falha real ao entrar não lança e mantém isFullscreen()=false', async () => {
  const fullscreen = makeFakeFullscreen({ fail: true });
  const platform = new PresentationPlatform({ fullscreen });
  const result = await platform.enterFullscreen({});
  assert.equal(result.supported, false);
  assert.equal(platform.isFullscreen(), false);
});

// --- Arquitetura ---

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('PresentationPlatform.js não importa @capacitor/*, @capawesome/* nem electron; usa só APIs Web por injeção (nunca navigator/window/document diretamente)', () => {
  const raw = readFileSync(path.resolve(__dirname, '../../www/app/adapters/PresentationPlatform.js'), 'utf8');
  const source = stripComments(raw);
  assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])@capacitor\//);
  assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])@capawesome\//);
  assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])electron['"]/);
  assert.doesNotMatch(source, /\bnavigator\./);
  assert.doesNotMatch(source, /\bwindow\./);
  assert.doesNotMatch(source, /\bdocument\./);
});
