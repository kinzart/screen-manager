'use strict';

// E2E (Edge real, celular 375 px): programação da tela pela interface da Central, comando remoto
// com estado "executado pela tela", controle manual e ausência de rolagem horizontal.
// Uso: node tests/central-ui.e2e.cjs [pasta-de-capturas]
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { chromium } = require('../mobile/node_modules/playwright');
const { createStudioServer } = require('../web/server');

const PASSWORD = 'fbs-central-ui-password-2026';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const variant = n => Buffer.concat([PNG, Buffer.from(`ui-${n}`)]);

async function waitUntil(check, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(message);
}

(async () => {
  const shots = process.argv[2];
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fbs-central-ui-'));
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const { port } = reservation.address();
  await new Promise(resolve => reservation.close(resolve));
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
  let browser;
  const errors = [];
  try {
    csrf = (await api('/api/v1/login', { password: PASSWORD })).csrf;
    const space = await api('/api/v1/spaces', { name: 'Igreja' });
    const media = [];
    for (const n of [1, 2]) {
      const bytes = variant(n);
      const created = await api('/api/v1/uploads', { spaceId: space.id, name: `m${n}.png`, size: bytes.length, mime: 'image/png' });
      await api(`/api/v1/uploads/${created.id}`, bytes, { method: 'PATCH', raw: true, headers: { 'Content-Type': 'application/octet-stream', 'Upload-Offset': '0' } });
      media.push(await api(`/api/v1/uploads/${created.id}/complete`, {}));
    }
    const sessions = [];
    for (const [index, name] of ['Abertura', 'Louvor'].entries()) {
      const created = await api('/api/v1/playlists', { spaceId: space.id, name });
      sessions.push(await api(`/api/v1/playlists/${created.id}`, { version: created.version, items: [{ mediaId: media[index].id, durationMs: 600000 }] }, { method: 'PUT' }));
    }

    browser = await chromium.launch({ channel: 'msedge' });
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const tv = await tvContext.newPage();
    tv.on('pageerror', error => errors.push('tv: ' + error.message));
    await tv.goto(`${base}/tv`);
    const code = await waitUntil(async () => (await tv.getByTestId('pair-code').textContent())?.trim(), 'código');
    const pending = await waitUntil(async () => (await api(`/api/v1/state?spaceId=${space.id}`)).pairings.find(entry => entry.code === code), 'pareamento');
    const screen = await api(`/api/v1/spaces/${space.id}/pairings/${pending.id}/approve`, { name: 'Telão' });

    const phone = await (await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })).newPage();
    phone.setDefaultTimeout(20000);
    phone.on('pageerror', error => errors.push('central: ' + error.message));
    await phone.goto(`${base}/studio`);
    await phone.getByTestId('login-password').fill(PASSWORD);
    await phone.getByTestId('login-submit').click();
    await phone.getByTestId('workspace-select').selectOption(space.id);
    await phone.locator(`[data-testid="screen-node"][data-id="${screen.id}"]`).getByTestId('node-select').click();
    await phone.getByTestId('sheet-open').click();
    await phone.getByTestId('screen-status').waitFor();

    // Monta a programação pela interface: Abertura → Louvor.
    await phone.getByTestId('program-add').click();
    await phone.getByTestId('program-add').click();
    const entries = phone.getByTestId('program-entry');
    assert.equal(await entries.count(), 2);
    await entries.nth(1).getByTestId('entry-session').selectOption(sessions[1].id);
    await phone.getByTestId('program-save').click();
    await waitUntil(async () => app.store.db.screens[screen.id].program?.entries.length === 2, 'programação salva no servidor');
    const saved = app.store.db.screens[screen.id].program.entries.map(entry => entry.playlistId);
    assert.deepEqual(saved, [sessions[0].id, sessions[1].id]);
    const tvMedia = () => tv.evaluate(() => document.querySelector('[data-testid="tv-media"]')?.dataset.mediaId || null);
    await waitUntil(async () => (await tvMedia()) === media[0].id, 'TV exibe a 1ª sessão da programação');
    if (shots) await phone.screenshot({ path: path.join(shots, 'central-375-program.png'), fullPage: true });

    // Comando remoto: próxima sessão, confirmado pela tela.
    await phone.getByTestId('screen-command-next-session').click();
    await waitUntil(async () => (await tvMedia()) === media[1].id, 'TV troca para a próxima sessão');
    await waitUntil(async () => /executado pela tela/.test(await phone.getByTestId('screen-status').textContent()), 'painel mostra comando executado', 25000);

    // Controle manual: assume a Abertura.
    await phone.getByTestId('take-session').selectOption(sessions[0].id);
    await phone.getByTestId('take-submit').click();
    await waitUntil(async () => (await tvMedia()) === media[0].id, 'TV mostra a sessão assumida');
    await waitUntil(async () => /Controle manual/.test(await phone.getByTestId('screen-status').textContent()), 'origem manual no painel');

    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `sem rolagem horizontal em 375 px (excesso ${overflow}px)`);
    if (shots) await phone.screenshot({ path: path.join(shots, 'central-375-manual.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('CENTRAL UI E2E PASS: programa pela interface, comando executado, controle manual, 375 px sem rolagem horizontal');
  } catch (error) {
    console.error('CENTRAL UI E2E FAIL:', error.message);
    if (errors.length) console.error(errors);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
})();
