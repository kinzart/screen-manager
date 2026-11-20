const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron, chromium } = require('../mobile/node_modules/playwright');

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fbs-electron-'));
  let app, browser;
  try {
    app = await _electron.launch({ executablePath: require('electron'), timeout: 20000, args: [path.join(__dirname, 'fixtures/desktop-session.cjs')],
      env: { ...process.env, FBS_TEST_PROFILE: dir } });
    app.process().stderr.on('data', data => { if (/Error|Exception/i.test(String(data))) process.stderr.write(data); });
    await app.firstWindow({ timeout: 15000 });
    const until = Date.now() + 20000;
    while (!app.windows().some(p => p.url().endsWith('control.html')) && Date.now() < until) await new Promise(r => setTimeout(r, 100));
    const desktop = app.windows().find(p => p.url().endsWith('control.html'));
    assert.ok(desktop, 'Painel Electron deve carregar');
    desktop.setDefaultTimeout(12000);
    console.log('Painel carregado. Habilitando pareamento.');
    await desktop.locator('#connections summary').click();
    await desktop.locator('#shareToggle').click();
    await desktop.waitForFunction(() => /^\d{8}$/.test(document.querySelector('#phoneCode').textContent));
    const base = 'http://127.0.0.1:' + await app.evaluate(() => global.fbsFixture.port);
    browser = await chromium.launch({ channel: 'msedge' });
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const phone = await phoneContext.newPage(), tv = await tvContext.newPage();
    phone.setDefaultTimeout(12000); tv.setDefaultTimeout(12000);
    const errors = [];
    for (const page of [phone, tv, desktop]) page.on('pageerror', error => errors.push(error.message));
    async function pair(page, route, selector) {
      await page.goto(base + route);
      await page.locator('#pairCode').fill(await desktop.locator(selector).textContent());
      await page.locator('#pairForm button').click();
      await page.waitForSelector('body[data-connected="true"]');
    }
    await pair(phone, '/', '#phoneCode');
    await pair(tv, '/tv', '#tvCode');
    console.log('Telefone e TV pareados. Testando a apresentação.');
    const file = path.resolve(__dirname, '../src/logo-bs.png');
    await phone.locator('#files').setInputFiles(file);
    await phone.locator('#uploadSend').click();
    await phone.getByRole('button', { name: 'Colocar logo-bs.png no ar' }).click();
    await tv.waitForFunction(() => document.querySelector('#stage img.media')?.naturalWidth > 0);
    assert.equal(await desktop.locator('#currentName').textContent(), 'logo-bs.png');
    await phone.locator('#lock').click();
    await desktop.waitForSelector('#lockBtn.active');
    await phone.locator('#playlist summary').first().click();
    await phone.locator('#playlist input[type=number]').fill('30');
    await phone.locator('#playlist input[type=number]').press('Tab');
    await desktop.waitForFunction(() => document.querySelector('.duration').value === '30');
    await phone.getByRole('button', { name: 'Pausar', exact: true }).click();
    await desktop.waitForFunction(() => document.querySelector('#playState').textContent === 'PAUSADO');
    await app.evaluate(() => global.fbsFixture.setTV(false));
    await phone.waitForFunction(() => document.querySelector('#connectionDetails').textContent.includes('Aguardando'));
    await app.evaluate(() => global.fbsFixture.setTV(true));
    await phone.waitForFunction(() => document.querySelector('#connectionDetails').textContent.includes('conectada'));
    assert.equal(await desktop.locator('#playState').textContent(), 'PAUSADO');
    assert.ok(await desktop.locator('#lockBtn.active').count());
    await desktop.locator('#blackoutBtn').click();
    await tv.waitForFunction(() => document.getElementById('logo').hidden && !document.querySelector('.media'));
    await tv.goto('about:blank');
    await phone.locator('#showLogo').click();
    await tv.goto(base + '/tv');
    await tv.waitForSelector('body[data-connected="true"]');
    await tv.waitForSelector('#logo:visible');
    if (await tv.evaluate(() => window.isSecureContext)) {
      await tv.evaluate(() => navigator.serviceWorker.ready);
      await tv.waitForFunction(() => !!navigator.serviceWorker.controller);
      await tvContext.setOffline(true);
      await tv.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await tv.title(), 'FBS · Saída de palco');
      await tvContext.setOffline(false);
      await tv.waitForSelector('body[data-connected="true"]');
    }
    await phone.locator('#addRule').click(); await desktop.waitForSelector('#rules .rule', { state: 'attached' });
    if (process.env.FBS_QA_VIDEO) {
      const name = path.basename(process.env.FBS_QA_VIDEO);
      await phone.locator('#files').setInputFiles(process.env.FBS_QA_VIDEO);
      await phone.locator('#uploadSend').click();
      await phone.getByRole('button', { name: 'Colocar ' + name + ' no ar' }).click();
      await tv.waitForFunction(() => document.querySelector('video.media')?.currentTime >= 1);
      await phone.getByRole('button', { name: 'Pausar', exact: true }).click();
      await tv.waitForFunction(() => document.querySelector('video.media')?.paused);
      const at = await tv.locator('video.media').evaluate(v => v.currentTime);
      await app.evaluate(() => global.fbsFixture.setTV(false));
      await tv.reload();
      await tv.waitForFunction(() => document.querySelector('video.media')?.readyState >= 2);
      await app.evaluate(() => global.fbsFixture.setTV(true));
      const restored = await tv.locator('video.media').evaluate(v => ({ time: v.currentTime, paused: v.paused }));
      assert.ok(restored.paused && Math.abs(restored.time - at) < 0.8, 'Vídeo volta ao ponto pausado');
      await phone.locator('#play').click();
      await tv.waitForFunction(time => document.querySelector('video.media')?.currentTime > time + 0.6, restored.time);
      console.log('Vídeo MP4 reproduzido, pausado, recarregado e retomado no receptor.');
    }
    for (const width of [320,390,768]) {
      await phone.setViewportSize({ width, height: 844 });
      assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Painel sem rolagem lateral a ' + width);
    }
    if (process.env.FBS_QA_SCREENSHOT) {
      await phone.setViewportSize({ width: 390, height: 844 }); await phone.evaluate(() => scrollTo(0, 0));
      await phone.screenshot({ path: process.env.FBS_QA_SCREENSHOT });
    }
    const oldURL = base + '/api/session?role=control';
    await desktop.locator('#shareToggle').click();
    await phone.waitForSelector('body[data-connected="false"]');
    assert.equal(await phoneContext.request.get(oldURL, { timeout: 1500 }).then(() => true, () => false), false);
    await desktop.locator('#shareToggle').click();
    await desktop.waitForFunction(() => /^\d{8}$/.test(document.querySelector('#phoneCode').textContent) && !document.querySelector('#shareInfo').hidden);
    const nextPort = await app.evaluate(() => global.fbsFixture.port);
    const pairing = await phoneContext.request.get('http://127.0.0.1:' + nextPort + '/api/session?role=control');
    assert.equal((await pairing.json()).paired, false, 'O pareamento antigo foi revogado');
    assert.deepEqual(errors, []);
    console.log('PASS Electron + navegador: envio, exibição na TV, bloqueio com edição, pausa, recuperação da saída, blackout, retorno da TV, regras, revogação e layout.');
  } finally {
    await browser?.close(); await app?.close();
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
