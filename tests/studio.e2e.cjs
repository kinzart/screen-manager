const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { chromium } = require('../mobile/node_modules/playwright');
const { createStudioServer } = require('../web/server');

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fbs-studio-browser-'));
  const evidence = path.resolve(__dirname, '../.maestro/fbs-analysis');
  let app;
  let browser;
  const errors = [];
  const password = process.env.FBS_E2E_PASSWORD || 'fbs-browser-test-password-2026';
  try {
    let base = process.env.FBS_E2E_BASE;
    if (!base) {
      const reservation = net.createServer();
      await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
      const port = reservation.address().port;
      await new Promise(resolve => reservation.close(resolve));
      base = `http://127.0.0.1:${port}`;
      app = await createStudioServer({ dataDir: directory, adminPassword: password, publicOrigin: base, secureCookies: false });
      await new Promise(resolve => app.server.listen(port, '127.0.0.1', resolve));
    }
    browser = await chromium.launch({ channel: 'msedge' });
    const operatorContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const tvContext1 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const tvContext2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const studio = await operatorContext.newPage();
    const tv1 = await tvContext1.newPage();
    const tv2 = await tvContext2.newPage();
    for (const page of [studio, tv1, tv2]) {
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(`${new URL(page.url()).pathname}: ${error.message}`));
    }
    async function waitUntil(check, message, timeout = 15000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(message);
    }
    async function node(kind, id) { return studio.locator(`[data-testid="${kind}-node"][data-id="${id}"]`); }
    async function select(kind, id) { await (await node(kind, id)).getByTestId('node-select').click(); await studio.getByTestId('sheet-open').click(); }
    async function snapshot() {
      return studio.evaluate(async () => {
        const spaceId = document.querySelector('[data-testid="workspace-select"]').value;
        return (await fetch('/api/v1/state?spaceId=' + spaceId)).json();
      });
    }
    async function output(page) { return page.getByTestId('tv-output').getAttribute('data-mode'); }
    async function imageVisible(page) {
      return page.evaluate(() => { const image = document.querySelector('[data-testid="tv-media"]'); return image?.tagName === 'IMG' && image.complete && image.naturalWidth > 0; });
    }
    async function route(sourceKind, sourceId, targetId, drag = false, expectedStatus = 200) {
      const from = (await node(sourceKind, sourceId)).getByTestId('source-port');
      const to = (await node('screen', targetId)).getByTestId('target-port');
      const response = studio.waitForResponse(result => result.url().endsWith(`/api/v1/screens/${targetId}/route`) && result.request().method() === 'PUT');
      if (drag) {
        await from.scrollIntoViewIfNeeded();
        await to.scrollIntoViewIfNeeded();
        const start = await from.boundingBox();
        const end = await to.boundingBox();
        assert.ok(start && end, 'ports must be visible');
        await studio.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
        await studio.mouse.down();
        await studio.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 12 });
        await studio.mouse.up();
      } else {
        await from.click();
        await to.click();
      }
      assert.equal((await response).status(), expectedStatus);
      if (expectedStatus !== 200) return;
      await waitUntil(async () => {
        const target = (await snapshot()).screens.find(entry => entry.id === targetId);
        return target.input?.id === sourceId && target.input.kind === sourceKind;
      }, 'wire did not commit');
      await waitUntil(async () => (await from.getAttribute('aria-pressed')) === 'false', 'wire selection did not clear');
    }

    await studio.goto(base + '/studio');
    await studio.getByTestId('login-password').fill(password);
    await studio.getByTestId('login-submit').click();
    await studio.getByTestId('new-space').click();
    await studio.getByTestId('create-name').fill('Evento de validação');
    await studio.getByTestId('create-submit').click();
    await waitUntil(async () => (await snapshot()).spaces.some(entry => entry.name === 'Evento de validação'), 'space missing');
    await studio.getByTestId('new-playlist').click();
    await studio.getByTestId('create-name').fill('Sessão principal');
    await studio.getByTestId('create-submit').click();
    await waitUntil(async () => (await snapshot()).playlists.length === 1, 'playlist missing');
    const playlistId = (await snapshot()).playlists[0].id;

    for (const [page, name] of [[tv1, 'Projetor Android'], [tv2, 'Notebook Linux']]) {
      await page.goto(base + '/tv');
      await page.waitForFunction(() => /^\d{6}$/.test(document.querySelector('[data-testid="pair-code"]').textContent.replace(/\D/g, '')));
      const code = (await page.getByTestId('pair-code').textContent()).replace(/\D/g, '');
      assert.match(code, /^\d{6}$/);
      await studio.getByTestId('pair-tab').click();
      await studio.locator(`[data-testid="pairing-row"][data-code="${code}"]`).getByTestId('approve-pairing').click();
      await studio.getByTestId('create-name').fill(name);
      await studio.getByTestId('create-submit').click();
      await waitUntil(async () => page.evaluate(async () => (await (await fetch('/api/v1/me?role=screen')).json()).authenticated === true), 'TV did not claim');
    }
    let state = await snapshot();
    const screen1 = state.screens.find(entry => entry.name === 'Projetor Android').id;
    const screen2 = state.screens.find(entry => entry.name === 'Notebook Linux').id;
    await studio.getByTestId('library-tab').click();
    await studio.getByTestId('upload-input').setInputFiles(path.resolve(__dirname, '../src/logo-bs.png'));
    await waitUntil(async () => (await snapshot()).media.length >= 1, 'image upload failed');
    const image = (await snapshot()).media.find(entry => entry.type === 'image');
    await select('playlist', playlistId);
    await studio.getByTestId('media-select').selectOption(image.id);
    await studio.getByTestId('media-add').click();
    await waitUntil(async () => (await studio.getByTestId('queue-row').count()) === 1, 'image row not added');
    await studio.getByTestId('queue-duration').fill('60');
    await studio.getByTestId('queue-duration').press('Tab');
    await studio.getByTestId('playlist-save').click();
    await waitUntil(async () => (await snapshot()).playlists[0].items.length === 1, 'queue save failed');
    await route('playlist', playlistId, screen1, true);
    await route('playlist', playlistId, screen2);
    await select('playlist', playlistId);
    await studio.getByTestId('transport-play').click();
    await waitUntil(() => imageVisible(tv1), 'TV1 did not render image');
    await waitUntil(() => imageVisible(tv2), 'TV2 did not render image');
    assert.equal(await tv1.evaluate(() => {
      const stage = document.getElementById('tv-stage').getBoundingClientRect();
      return Math.abs(stage.width - innerWidth) < 1 && Math.abs(stage.height - innerHeight) < 1;
    }), true, 'the media stage must occupy the full display');
    await waitUntil(async () => (await snapshot()).screens.every(entry => entry.status === 'playing'), 'receivers did not acknowledge playing');
    console.log('Two receivers paired, image uploaded and real wire drag confirmed.');

    const title = studio.locator('#playlist-name');
    if (await title.count()) {
      await title.fill('Edição em andamento');
      await studio.waitForTimeout(1300);
      assert.equal(await title.inputValue(), 'Edição em andamento', 'polling must preserve an unfinished edit');
    }
    await studio.getByTestId('transport-blackout').click();
    await waitUntil(async () => (await output(tv1)) === 'blackout' && (await output(tv2)) === 'blackout', 'blackout not mirrored');
    await studio.getByTestId('transport-blackout').click();
    await waitUntil(() => imageVisible(tv1), 'image did not return');
    await route('screen', screen1, screen2);
    await route('screen', screen2, screen1, false, 409);
    assert.equal((await snapshot()).screens.find(entry => entry.id === screen1).input.id, playlistId);
    console.log('Mirror routing and cycle rejection confirmed.');

    await route('playlist', playlistId, screen2);
    await select('screen', screen1);
    await studio.getByTestId('disconnect-screen').click();
    await waitUntil(async () => (await output(tv1)) === 'idle', 'TV1 did not disconnect');
    assert.ok(await imageVisible(tv2), 'TV2 must keep displaying independently');
    await route('playlist', playlistId, screen1);
    await waitUntil(() => imageVisible(tv1), 'TV1 did not reconnect');

    await tvContext1.setOffline(true);
    await select('playlist', playlistId);
    await studio.getByTestId('transport-blackout').click();
    await waitUntil(async () => (await output(tv2)) === 'blackout', 'online TV2 missed command');
    assert.ok(await imageVisible(tv1), 'offline receiver should retain its last media');
    await tvContext1.setOffline(false);
    await waitUntil(async () => (await output(tv1)) === 'blackout', 'reconnected TV did not recover authoritative state');
    await studio.getByTestId('transport-blackout').click();
    console.log('Independent disconnect and offline recovery confirmed.');

    const video = await studio.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 180;
      const context = canvas.getContext('2d');
      let frame = 0;
      function paint() { context.fillStyle = frame++ % 2 ? '#e7ad3c' : '#65c8d0'; context.fillRect(0, 0, 320, 180); context.fillStyle = '#11110f'; context.fillText('FBS ' + frame, 90, 90); }
      paint();
      const timer = setInterval(paint, 100);
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      const chunks = [];
      const completed = new Promise(resolve => { recorder.ondataavailable = event => chunks.push(event.data); recorder.onstop = resolve; });
      recorder.start();
      await new Promise(resolve => setTimeout(resolve, 5000));
      recorder.stop();
      await completed;
      clearInterval(timer);
      stream.getTracks().forEach(track => track.stop());
      return [...new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer())];
    });
    await studio.getByTestId('library-tab').click();
    await studio.getByTestId('upload-input').setInputFiles({ name: 'signal.webm', mimeType: 'video/webm', buffer: Buffer.from(video) });
    await waitUntil(async () => (await snapshot()).media.some(entry => entry.type === 'video'), 'video upload failed');
    state = await snapshot();
    const movie = state.media.find(entry => entry.type === 'video');
    await select('playlist', playlistId);
    await studio.getByTestId('media-select').selectOption(movie.id);
    await studio.getByTestId('media-add').click();
    await waitUntil(async () => (await studio.getByTestId('queue-row').count()) === 2, 'video row not added');
    await studio.getByTestId('queue-duration').last().fill('5');
    await studio.getByTestId('queue-duration').last().press('Tab');
    await studio.getByTestId('playlist-save').click();
    await waitUntil(async () => (await snapshot()).playlists[0].items.length === 2, 'video queue save failed');
    await studio.getByTestId('queue-play').last().click();
    await waitUntil(async () => tv1.evaluate(() => { const media = document.querySelector('[data-testid="tv-media"]'); return media?.tagName === 'VIDEO' && media.currentTime > 0.2 && !media.paused; }), 'video did not play');
    await studio.getByTestId('transport-pause').click();
    await waitUntil(async () => tv1.evaluate(() => document.querySelector('video')?.paused), 'video did not pause');
    const paused = await tv1.locator('video').evaluate(video => video.currentTime);
    await studio.waitForTimeout(1200);
    assert.ok(Math.abs((await tv1.locator('video').evaluate(video => video.currentTime)) - paused) < 0.15, 'paused frame must remain stable');
    await tv1.reload();
    await waitUntil(async () => tv1.evaluate(() => document.querySelector('video')?.paused && document.querySelector('video').readyState >= 2), 'reloaded TV lost its session or paused video');
    await studio.getByTestId('transport-play').click();
    await waitUntil(async () => tv1.evaluate(() => !document.querySelector('video')?.paused), 'video did not resume');
    console.log('Video playback, stable pause, cookie reload and resume confirmed.');

    await studio.screenshot({ path: path.join(evidence, 'studio-desktop.png'), fullPage: true });
    const mobile = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await mobile.addCookies(await operatorContext.cookies());
    const phone = await mobile.newPage();
    phone.on('pageerror', error => errors.push('mobile: ' + error.message));
    await phone.goto(base + '/studio');
    await phone.getByTestId('new-playlist').waitFor();
    await phone.getByTestId('screen-node').first().getByTestId('node-select').click();
    await phone.getByTestId('sheet-open').click();
    await phone.getByTestId('screen-source').selectOption('');
    await phone.waitForTimeout(1200);
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(overflow, false, '375px layout must not overflow the page');
    await phone.screenshot({ path: path.join(evidence, 'studio-mobile.png'), fullPage: true });
    await tv2.screenshot({ path: path.join(evidence, 'studio-receiver.png') });
    assert.deepEqual(errors, [], 'no unhandled browser errors');
    if (process.env.FBS_E2E_BASE) {
      const finalState = await snapshot();
      await fs.mkdir(path.join(evidence, 'private'), { recursive: true, mode: 0o700 });
      await fs.writeFile(path.join(evidence, 'private', 'live-verification.json'), JSON.stringify({
        base, spaceId: finalState.spaceId, playlistId, screen1, screen2, imageId: image.id,
        operatorCookies: await operatorContext.cookies(), screenCookies: await tvContext2.cookies(),
      }), { mode: 0o600 });
    }
    console.log('375px mobile controls and desktop layout confirmed. E2E passed.');
  } catch (error) {
    if (browser) {
      let index = 0;
      for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: path.join(evidence, `studio-failure-${index++}.png`), fullPage: true }).catch(() => {});
    }
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await app?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
})();
