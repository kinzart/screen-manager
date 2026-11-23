'use strict';

// E2E (Edge real): receptor /tv com programa de sessões, pré-carga em blocos verificados,
// Range servido do cache, execução offline do plano e reconexão.
// Uso: node tests/tv-offline.e2e.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { chromium } = require('../mobile/node_modules/playwright');
const { createStudioServer } = require('../web/server');

const PASSWORD = 'fbs-tv-offline-password-2026';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const variant = n => Buffer.concat([PNG, Buffer.from(`variant-${n}`)]);
const BIG = Buffer.concat([PNG, Buffer.alloc(17 * 1024 * 1024 + 123, 7)]); // 3 blocos de 8 MiB
for (let i = 4096; i < BIG.length; i += 4093) BIG[i] = i % 251; // preserva o cabeçalho PNG

async function freePort() {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const { port } = reservation.address();
  await new Promise(resolve => reservation.close(resolve));
  return port;
}

async function waitUntil(check, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(message);
}

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fbs-tv-offline-'));
  const port = await freePort();
  // localhost é contexto seguro: Service Worker, Cache Storage e crypto.subtle disponíveis.
  const base = `http://localhost:${port}`;
  const app = await createStudioServer({ dataDir: directory, adminPassword: PASSWORD, publicOrigin: base, secureCookies: false });
  await new Promise(resolve => app.server.listen(port, '127.0.0.1', resolve));
  const cookies = new Map();
  let csrf;
  async function api(route, body, { method = body === undefined ? 'GET' : 'POST', raw = false, headers = {} } = {}) {
    const all = { Origin: base, ...headers };
    if (cookies.size) all.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (csrf) all['X-FBS-CSRF'] = csrf;
    if (body !== undefined && !raw) all['Content-Type'] = 'application/json';
    const response = await fetch(base + route, { method, headers: all, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) { const [pair] = value.split(';'); cookies.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)); }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${JSON.stringify(data)}`);
    return data;
  }
  async function upload(spaceId, name, bytes) {
    const created = await api('/api/v1/uploads', { spaceId, name, size: bytes.length, mime: 'image/png' });
    for (let offset = 0; offset < bytes.length; offset += 2 * 1024 * 1024) {
      await api(`/api/v1/uploads/${created.id}`, bytes.subarray(offset, offset + 2 * 1024 * 1024),
        { method: 'PATCH', raw: true, headers: { 'Content-Type': 'application/octet-stream', 'Upload-Offset': String(offset) } });
    }
    return api(`/api/v1/uploads/${created.id}/complete`, {});
  }
  let browser;
  const errors = [];
  const evidence = [];
  try {
    csrf = (await api('/api/v1/login', { password: PASSWORD })).csrf;
    const space = await api('/api/v1/spaces', { name: 'Offline' });
    const [p1, p2, big] = [await upload(space.id, 'p1.png', variant(1)), await upload(space.id, 'p2.png', variant(2)), await upload(space.id, 'grande.png', BIG)];
    assert.equal(big.chunks.length, 3);
    async function playlist(name, items) {
      const created = await api('/api/v1/playlists', { spaceId: space.id, name });
      return api(`/api/v1/playlists/${created.id}`, { version: created.version, items, loop: true }, { method: 'PUT' });
    }
    const A = await playlist('A', [{ mediaId: p1.id, durationMs: 3000 }]);
    const B = await playlist('B', [{ mediaId: p2.id, durationMs: 3000 }]);
    const D = await playlist('D', [{ mediaId: big.id, durationMs: 3000 }]);

    browser = await chromium.launch({ channel: 'msedge' });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const tv = await context.newPage();
    tv.setDefaultTimeout(20000);
    tv.on('pageerror', error => errors.push(error.message));
    await tv.goto(`${base}/tv`);
    const code = await waitUntil(async () => (await tv.getByTestId('pair-code').textContent())?.trim(), 'código de pareamento');
    const pending = await waitUntil(async () => (await api(`/api/v1/state?spaceId=${space.id}`)).pairings.find(entry => entry.code === code), 'pareamento visível');
    const screen = await api(`/api/v1/spaces/${space.id}/pairings/${pending.id}/approve`, { name: 'TV offline' });
    await api(`/api/v1/screens/${screen.id}/program`, { version: screen.version, program: {
      endBehavior: 'repeat',
      entries: [{ playlistId: A.id }, { playlistId: B.id }, { playlistId: D.id, start: { type: 'at', atMs: Date.now() + 3600 * 1000 } }],
    } }, { method: 'PUT' });

    const mediaId = () => tv.evaluate(() => document.querySelector('[data-testid="tv-media"]')?.dataset.mediaId || null);
    const imageOk = () => tv.evaluate(() => { const node = document.querySelector('[data-testid="tv-media"]'); return Boolean(node && node.complete && node.naturalWidth > 0); });
    await waitUntil(async () => [p1.id, p2.id].includes(await mediaId()), 'receptor exibe a programação');
    evidence.push('programa exibido no receptor');

    const operatorScreen = async () => (await api(`/api/v1/state?spaceId=${space.id}`)).screens.find(entry => entry.id === screen.id);
    let lastTelemetry = null;
    const ready = await waitUntil(async () => {
      const view = await operatorScreen();
      lastTelemetry = view.lastTelemetry;
      const cache = view.telemetry?.cache;
      return cache && cache.supported && cache.total === 3 && cache.ready === 3 ? view : null;
    }, 'telemetria indica 3/3 mídias em cache', 60000).catch(error => {
      throw new Error(`${error.message}; última telemetria: ${JSON.stringify(lastTelemetry)}`);
    });
    assert.equal(ready.telemetry.app.version, '1.1.0');
    assert.ok(ready.telemetry.storage.quota > 0);
    evidence.push(`cache pronto 3/3, ${ready.telemetry.cache.bytesReady} bytes`);

    // Range atravessando a fronteira de bloco, servido pelo Service Worker a partir do cache.
    const start = 8 * 1024 * 1024 - 10;
    const ranged = await tv.evaluate(async ({ id, start }) => {
      const response = await fetch(`/api/v1/media/${id}?role=screen`, { headers: { Range: `bytes=${start}-${start + 29}` } });
      return { status: response.status, hit: response.headers.get('x-fbs-cache'), range: response.headers.get('content-range'),
        bytes: Array.from(new Uint8Array(await response.arrayBuffer())) };
    }, { id: big.id, start });
    assert.equal(ranged.status, 206);
    assert.equal(ranged.hit, 'hit');
    assert.equal(ranged.range, `bytes ${start}-${start + 29}/${BIG.length}`);
    assert.deepEqual(ranged.bytes, Array.from(BIG.subarray(start, start + 30)));
    evidence.push('Range 206 entre blocos servido do cache com bytes idênticos');

    // Sem rede: o receptor continua alternando A/B pelo plano local, com imagens vindas do cache.
    await context.setOffline(true);
    const seen = new Set();
    const offlineDeadline = Date.now() + 12000;
    while (Date.now() < offlineDeadline) {
      const id = await mediaId();
      if (id && await imageOk()) seen.add(id);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(seen.has(p1.id) && seen.has(p2.id), `offline alternou A/B: ${[...seen].join(',')}`);
    const network = await tv.locator('#tv-network').textContent();
    assert.match(network, /Sem conexão/);
    evidence.push('offline: alternância A→B pelo plano local com imagens do cache');

    // Reconexão: o servidor volta a ser a autoridade e o ACK confirma a versão atual.
    await context.setOffline(false);
    await waitUntil(async () => {
      const view = await operatorScreen();
      return view.online && view.ack && ['playing', 'paused'].includes(view.status);
    }, 'reconexão com ACK atual', 20000);
    evidence.push('reconexão confirmada por ACK');
    assert.deepEqual(errors, []);
    console.log('TV OFFLINE E2E PASS');
    for (const line of evidence) console.log(' -', line);
  } catch (error) {
    console.error('TV OFFLINE E2E FAIL:', error.message);
    if (errors.length) console.error('page errors:', errors);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
})();
