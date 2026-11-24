'use strict';

// E2E (Edge real, celular 390 px): menu de ações no card, reiniciar tela (recarrega o receptor),
// nome "FBS N" no pareamento, exclusão de mídia com confirmação, painel sem zoom, app instalável
// e editor de avisos mandando a imagem para a TV.
// Uso: node tests/mobile-ux.e2e.cjs [pasta-de-capturas]
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { chromium } = require('../mobile/node_modules/playwright');
const { createStudioServer } = require('../web/server');

const PIN = '583027';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const variant = n => Buffer.concat([PNG, Buffer.from(`ux-${n}`)]);

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
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fbs-mobile-ux-'));
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const { port } = reservation.address();
  await new Promise(resolve => reservation.close(resolve));
  const base = `http://localhost:${port}`;
  const app = await createStudioServer({ dataDir: directory, adminPassword: PIN, publicOrigin: base, secureCookies: false });
  await new Promise(resolve => app.server.listen(port, '127.0.0.1', resolve));
  const db = () => app.store.db;
  let browser;
  const errors = [];
  const evidence = [];
  try {
    browser = await chromium.launch({ channel: 'msedge' });
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const tv = await tvContext.newPage();
    tv.on('pageerror', error => errors.push('tv: ' + error.message));
    let tvLoads = 0;
    tv.on('load', () => { tvLoads += 1; });
    await tv.goto(`${base}/tv`);
    const code = await waitUntil(async () => (await tv.getByTestId('pair-code').textContent())?.trim(), 'código de pareamento');

    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });
    const phone = await phoneContext.newPage();
    phone.setDefaultTimeout(20000);
    phone.on('pageerror', error => errors.push('painel: ' + error.message));
    await phone.goto(`${base}/studio`);
    const viewport = await phone.getAttribute('meta[name="viewport"]', 'content');
    assert.match(viewport, /user-scalable=no/);
    assert.equal(await phone.evaluate(() => getComputedStyle(document.documentElement).touchAction), 'manipulation');
    const manifest = await (await fetch(`${base}/studio.webmanifest`)).json();
    assert.equal(manifest.display, 'standalone');
    for (const icon of manifest.icons) assert.equal((await fetch(base + icon.src)).status, 200, icon.src);
    evidence.push('sem zoom (viewport + touch-action) e manifesto instalável com ícones');

    // PIN de 6 números com teclado numérico.
    assert.equal(await phone.getAttribute('[data-testid="login-password"]', 'inputmode'), 'numeric');
    await phone.getByTestId('login-password').fill(PIN);
    await phone.getByTestId('login-submit').click();
    await phone.getByTestId('new-space').click();
    await phone.getByTestId('create-name').fill('Igreja');
    await phone.getByTestId('create-submit').click();
    await waitUntil(() => Object.keys(db().spaces).length === 1, 'espaço criado');

    // Pareamento: nome sugerido "FBS 1".
    await phone.getByTestId('pair-tab').click();
    await phone.locator(`[data-testid="pairing-row"][data-code="${code}"]`).getByTestId('approve-pairing').click();
    assert.equal(await phone.getByTestId('create-name').inputValue(), 'FBS 1');
    await phone.getByTestId('create-submit').click();
    const screenId = await waitUntil(() => Object.values(db().screens)[0]?.id, 'tela aprovada');
    evidence.push('pareamento sugere "FBS 1"');

    // Biblioteca: 2 mídias pela API do próprio painel (mesma sessão).
    const space = Object.values(db().spaces)[0];
    const media = await phone.evaluate(async ({ spaceId, files }) => {
      const csrf = (await (await fetch('/api/v1/me')).json()).csrf;
      const call = async (route, method, body, headers = {}) => {
        const response = await fetch('/api/v1' + route, { method, body, headers: { 'X-FBS-CSRF': csrf, ...headers } });
        return response.json();
      };
      const out = [];
      for (const [name, bytes] of files) {
        const data = new Uint8Array(bytes);
        const created = await call('/uploads', 'POST', JSON.stringify({ spaceId, name, size: data.length, mime: 'image/png' }), { 'Content-Type': 'application/json' });
        await call('/uploads/' + created.id, 'PATCH', data, { 'Content-Type': 'application/octet-stream', 'Upload-Offset': '0' });
        out.push(await call('/uploads/' + created.id + '/complete', 'POST', '{}', { 'Content-Type': 'application/json' }));
      }
      return out;
    }, { spaceId: space.id, files: [['um.png', [...variant(1)]], ['dois.png', [...variant(2)]]] });
    await phone.getByTestId('new-playlist').click();
    await phone.getByTestId('create-name').fill('Louvor');
    await phone.getByTestId('create-submit').click();
    const playlistId = await waitUntil(() => Object.values(db().playlists)[0]?.id, 'sessão criada');
    const created = db().playlists[playlistId];
    await phone.evaluate(async ({ id, version, items }) => {
      const csrf = (await (await fetch('/api/v1/me')).json()).csrf;
      await fetch('/api/v1/playlists/' + id, { method: 'PUT', headers: { 'X-FBS-CSRF': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ version, items, loop: true }) });
    }, { id: playlistId, version: created.version, items: media.map(item => ({ mediaId: item.id, durationMs: 600000 })) });

    // O painel atualiza a cada segundo: espera o card da sessão mostrar as 2 mídias.
    await waitUntil(async () => /2 mídias/.test(await phone.locator(`[data-testid="playlist-node"][data-id="${playlistId}"]`).textContent()), 'painel mostra a sessão com mídias');
    // Toque no card da tela: menu de ações; "Assumir uma sessão agora" → Louvor.
    await phone.locator(`[data-testid="screen-node"][data-id="${screenId}"]`).getByTestId('node-select').click();
    await phone.getByTestId('action-sheet').waitFor();
    const sheetBox = await phone.getByTestId('action-sheet').boundingBox();
    assert.ok(sheetBox.y + sheetBox.height >= 844 - 2 && sheetBox.width >= 389, `menu preso embaixo e na largura toda (${JSON.stringify(sheetBox)})`);
    if (shots) await phone.screenshot({ path: path.join(shots, 'mobile-sheet-screen.png') });
    await phone.getByTestId('sheet-take').click();
    await phone.getByTestId('sheet-pick').first().click();
    const tvMedia = () => tv.evaluate(() => document.querySelector('[data-testid="tv-media"]')?.dataset.mediaId || null);
    await waitUntil(async () => (await tvMedia()) === media[0].id, 'TV mostra a sessão assumida pelo menu');
    evidence.push('menu de ações no card (bottom sheet) e "Assumir sessão" pela tela');

    // Reiniciar tela: o receptor recarrega a página e volta a exibir.
    const loadsBefore = tvLoads;
    await phone.locator(`[data-testid="screen-node"][data-id="${screenId}"]`).getByTestId('node-select').click();
    await phone.getByTestId('sheet-reload').click();
    await waitUntil(() => tvLoads > loadsBefore, 'receptor recarregou', 15000);
    await waitUntil(async () => (await tvMedia()) === media[0].id, 'receptor voltou a exibir depois de recarregar');
    await new Promise(resolve => setTimeout(resolve, 3000));
    assert.equal(tvLoads, loadsBefore + 1, 'recarregou uma única vez (sem laço)');
    evidence.push('reiniciar tela recarrega o receptor uma vez e ele volta a exibir');

    // Excluir mídia pela biblioteca, com confirmação própria (sem window.confirm).
    await phone.getByTestId('library-tab').click();
    const row = phone.locator(`[data-testid="library-media"][data-id="${media[1].id}"]`);
    await row.getByTestId('media-delete').click();
    await phone.getByTestId('confirm-dialog').waitFor();
    assert.match(await phone.getByTestId('confirm-dialog').textContent(), /Louvor/);
    await phone.getByTestId('confirm-submit').click();
    await waitUntil(() => !db().media[media[1].id], 'mídia excluída no servidor');
    assert.deepEqual(db().playlists[playlistId].items.map(item => item.mediaId), [media[0].id]);
    evidence.push('excluir mídia pela biblioteca com confirmação, retirando-a da sessão');

    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `painel sem rolagem horizontal (excesso ${overflow}px)`);
    if (shots) await phone.screenshot({ path: path.join(shots, 'mobile-panel.png'), fullPage: true });

    // Editor de avisos: texto com emoji → "Mostrar agora" → TV exibe a imagem nova.
    await phone.goto(`${base}/avisos`);
    await phone.getByTestId('editor-title').fill('Culto de hoje 🙏');
    await phone.getByTestId('editor-message').fill('Começa às 19h ✨ Traga um amigo!');
    await phone.getByTestId('theme-ocean').click();
    await phone.getByTestId('send-show').waitFor({ state: 'visible' });
    const editorOverflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(editorOverflow <= 0, `editor sem rolagem horizontal (excesso ${editorOverflow}px)`);
    if (shots) await phone.screenshot({ path: path.join(shots, 'mobile-editor.png'), fullPage: true });
    const download = phone.waitForEvent('download');
    await phone.getByTestId('download-png').click();
    const file = await (await download).path();
    const header = (await fs.readFile(file)).subarray(0, 8);
    assert.deepEqual([...header], [137, 80, 78, 71, 13, 10, 26, 10], 'PNG válido');
    await phone.getByTestId('send-show').click();
    const notice = await waitUntil(() => Object.values(db().media).find(item => item.name.startsWith('culto-de-hoje')), 'aviso enviado para a biblioteca');
    await waitUntil(async () => (await tvMedia()) === notice.id, 'TV exibe o aviso', 25000);
    assert.ok(Object.values(db().playlists).some(item => item.name.startsWith('Aviso · Culto de hoje')));
    evidence.push(`editor: PNG baixado e aviso no ar na TV (${notice.size} bytes)`);
    if (shots) await tv.screenshot({ path: path.join(shots, 'tv-aviso.png') });

    assert.deepEqual(errors, []);
    console.log('MOBILE UX E2E PASS');
    for (const line of evidence) console.log(' -', line);
  } catch (error) {
    console.error('MOBILE UX E2E FAIL:', error.message);
    if (errors.length) console.error(errors);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await app.close();
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
})();
