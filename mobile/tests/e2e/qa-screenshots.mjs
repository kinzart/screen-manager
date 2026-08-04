// Script de QA visual (não faz parte de `npm test` — rodado manualmente).
// Gera screenshots reais em múltiplos viewports para inspeção humana/IA.
// Usa Edge do sistema (channel: 'msedge'), sobe seu próprio Vite dedicado.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(__dirname, '../..');
const FIXTURE_IMAGE = path.resolve(__dirname, '../fixtures/sample-image.png');
const OUT_DIR = path.resolve(MOBILE_ROOT, 'qa/screenshots');
const PORT = 5198;
const BASE_URL = `http://127.0.0.1:${PORT}/`;

fs.mkdirSync(OUT_DIR, { recursive: true });

function waitForServer(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error('timeout'));
        else setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

const viewports = {
  iphone13Portrait: { width: 390, height: 844 },
  iphone13Landscape: { width: 844, height: 390 },
  desktop: { width: 1280, height: 800 },
  small: { width: 320, height: 568 },
};

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  console.log('saved', name);
}

async function main() {
  const viteBin = path.resolve(MOBILE_ROOT, 'node_modules/vite/bin/vite.js');
  const child = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: MOBILE_ROOT, stdio: 'ignore' });
  try {
    await waitForServer(BASE_URL);
    const browser = await chromium.launch({ channel: 'msedge' });

    // iPhone 13 retrato: fluxo completo de telas
    {
      const context = await browser.newContext({ viewport: viewports.iphone13Portrait });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'load' });
      await page.waitForSelector('#boot-loading[hidden]', { state: 'attached' });
      await shot(page, 'debug-initial');

      await page.locator('.bottom-nav-item', { hasText: 'Início' }).click({ timeout: 5000 });
      await shot(page, 'home-empty');

      await page.locator('button', { hasText: 'Importar mídia' }).first().click();
      const input1 = page.locator('input[type="file"]').first();
      await input1.setInputFiles(FIXTURE_IMAGE);
      await page.waitForTimeout(300);
      await page.locator('.bottom-nav-item', { hasText: 'Início' }).click();
      await shot(page, 'home-with-playlist');

      await page.locator('.bottom-nav-item', { hasText: 'Playlist' }).click();
      await shot(page, 'playlist');

      await page.locator('.editor-more').first().click();
      await shot(page, 'playlist-item-editor');

      await page.locator('.bottom-nav-item', { hasText: 'Configurações' }).click();
      await shot(page, 'settings');

      await page.locator('.app-screen:not([hidden])').evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await shot(page, 'settings-logo');
      await page.locator('.app-screen:not([hidden])').evaluate((el) => { el.scrollTop = 0; });

      await page.locator('.bottom-nav-item', { hasText: 'Apresentação' }).click();
      await shot(page, 'presentation-idle');

      await page.locator('.presentation-start-button').click();
      await page.waitForSelector('.presenter-media');
      await page.waitForTimeout(200);
      await shot(page, 'presentation-with-controls');

      await page.getByRole('button', { name: 'Ativar blackout' }).click();
      await shot(page, 'presentation-blackout');

      await page.getByRole('button', { name: 'Exibir logo' }).click();
      await page.waitForTimeout(3200); // espera o auto-hide dos controles
      await shot(page, 'presentation-no-controls');

      await context.close();
    }

    // iPhone 13 paisagem
    {
      const context = await browser.newContext({ viewport: viewports.iphone13Landscape });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'load' });
      await page.waitForSelector('#boot-loading[hidden]', { state: 'attached' });
      await shot(page, 'landscape-home');
      await context.close();
    }

    // Desktop de referência
    {
      const context = await browser.newContext({ viewport: viewports.desktop });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'load' });
      await page.waitForSelector('#boot-loading[hidden]', { state: 'attached' });
      await shot(page, 'desktop-reference');
      await context.close();
    }

    // Viewport pequeno adicional
    {
      const context = await browser.newContext({ viewport: viewports.small });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'load' });
      await page.waitForSelector('#boot-loading[hidden]', { state: 'attached' });
      await shot(page, 'small-viewport-home');
      await context.close();
    }

    // Erro de mídia (importar, recarregar, tentar apresentar)
    {
      const context = await browser.newContext({ viewport: viewports.iphone13Portrait });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'load' });
      await page.waitForSelector('#boot-loading[hidden]', { state: 'attached' });
      await page.getByRole('button', { name: 'Importar mídia do aparelho' }).click();
      await page.locator('input[type="file"]').first().setInputFiles(FIXTURE_IMAGE);
      await page.waitForTimeout(900); // aguarda o autosave debounced (500ms) persistir a playlist antes do reload
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('#boot-loading[hidden]', { state: 'attached' });
      await page.waitForTimeout(300);
      await shot(page, 'media-error-unavailable');
      await context.close();
    }

    await browser.close();
  } finally {
    child.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
