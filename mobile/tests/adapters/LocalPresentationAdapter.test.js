import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { LocalPresentationAdapter } from '../../www/app/adapters/LocalPresentationAdapter.js';
import { PresentationPlatform } from '../../www/app/adapters/PresentationPlatform.js';
import { PresenterView } from '../../www/app/ui/PresenterView.js';
import { PresentationAdapter } from '../../www/app/core/ports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeView() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  return new PresenterView({ root: dom.window.document.getElementById('root') });
}

function makeItem(overrides = {}) {
  return {
    id: 'a',
    media: { storage: 'sandbox', relPath: 'library/a.png', mime: 'image/png', bytes: 10 },
    name: 'a.png',
    type: 'image',
    duration: 10,
    transition: 'fade',
    fit: 'contain',
    startAt: '',
    ...overrides,
  };
}

test('show(): resolve a URL via resolveSrc (MediaPort) e mostra imagem', async () => {
  const view = makeView();
  const resolveSrc = async (ref) => `capacitor://${ref.relPath}`;
  const adapter = new LocalPresentationAdapter({ view, resolveSrc });
  await adapter.show(makeItem());
  const img = view.mediaSlotEl.querySelector('img');
  assert.equal(img.src, 'capacitor://library/a.png');
});

test('show(): item de vídeo chama showVideo com loop derivado de duration', async () => {
  const view = makeView();
  const resolveSrc = async () => 'capacitor://library/v.mp4';
  const adapter = new LocalPresentationAdapter({ view, resolveSrc });
  await adapter.show(makeItem({ type: 'video', duration: 5 }));
  const video = view.mediaSlotEl.querySelector('video');
  assert.ok(video);
  assert.equal(video.loop, true);
});

test('blackout()/logo()/pause()/resume()/clear() delegam para a view', async () => {
  const view = makeView();
  const adapter = new LocalPresentationAdapter({ view, resolveSrc: async () => 'x' });
  await adapter.show(makeItem({ type: 'video' }));
  await adapter.blackout();
  assert.equal(view.blackoutEl.hidden, false);
  await adapter.logo();
  assert.equal(view.logoEl.hidden, false);
  await adapter.clear();
  assert.equal(view.mediaSlotEl.children.length, 0);
  await assert.doesNotReject(() => adapter.pause());
  await assert.doesNotReject(() => adapter.resume());
});

test('status emitido: erro em resolveSrc é reportado via onStatus e a view mostra erro', async () => {
  const view = makeView();
  const resolveSrc = async () => { throw new Error('mídia ausente no sandbox'); };
  const adapter = new LocalPresentationAdapter({ view, resolveSrc });
  const statuses = [];
  adapter.onStatus((s) => statuses.push(s));
  await adapter.show(makeItem());
  assert.equal(statuses.length, 1);
  assert.match(statuses[0].error, /mídia ausente no sandbox/);
  assert.equal(view.errorEl.hidden, false);
});

test('status emitido: erros da própria PresenterView (ex.: <video> error) também chegam via onStatus do adapter', async () => {
  const view = makeView();
  const adapter = new LocalPresentationAdapter({ view, resolveSrc: async () => 'clipe.mp4' });
  const statuses = [];
  adapter.onStatus((s) => statuses.push(s));
  await adapter.show(makeItem({ type: 'video' }));
  const video = view.mediaSlotEl.querySelector('video');
  video.dispatchEvent(new video.ownerDocument.defaultView.Event('error'));
  assert.equal(statuses.length, 1);
  assert.ok(statuses[0].error);
});

test('capabilities(): honestas — fullscreen só é true quando a plataforma realmente suporta', () => {
  const view = makeView();
  const withoutPlatform = new LocalPresentationAdapter({ view, resolveSrc: async () => 'x' });
  assert.deepEqual(withoutPlatform.capabilities(), { fullscreen: false, remote: false, secondScreen: false });

  const supportedPlatform = new PresentationPlatform({ fullscreen: { request: async () => {}, exit: async () => {} } });
  const withPlatform = new LocalPresentationAdapter({ view: makeView(), resolveSrc: async () => 'x', platform: supportedPlatform });
  assert.deepEqual(withPlatform.capabilities(), { fullscreen: true, remote: false, secondScreen: false });
});

test('capabilities(): remote e secondScreen são sempre false nesta etapa (v1 local-only)', () => {
  const view = makeView();
  const adapter = new LocalPresentationAdapter({ view, resolveSrc: async () => 'x' });
  const caps = adapter.capabilities();
  assert.equal(caps.remote, false);
  assert.equal(caps.secondScreen, false);
});

test('LocalPresentationAdapter implementa integralmente a PresentationAdapter', () => {
  const view = makeView();
  const adapter = new LocalPresentationAdapter({ view, resolveSrc: async () => 'x' });
  assert.ok(adapter instanceof PresentationAdapter);
  for (const method of ['show', 'blackout', 'logo', 'pause', 'resume', 'clear', 'onStatus', 'capabilities']) {
    assert.notEqual(adapter[method], PresentationAdapter.prototype[method]);
  }
});

test('LocalPresentationAdapter nunca tenta segundo monitor: sem referência a screen.isExtended/getScreenDetails/BrowserWindow', () => {
  const source = readFileSync(path.resolve(__dirname, '../../www/app/adapters/LocalPresentationAdapter.js'), 'utf8');
  assert.doesNotMatch(source, /getScreenDetails|isExtended|BrowserWindow|screen\.getAllDisplays/);
});

test('ausência de Electron: LocalPresentationAdapter.js não importa electron nem @capacitor/*', () => {
  const source = readFileSync(path.resolve(__dirname, '../../www/app/adapters/LocalPresentationAdapter.js'), 'utf8');
  assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])electron['"]/);
  assert.doesNotMatch(source, /(?:from\s+['"]|require\(\s*['"])@capacitor\//);
});
