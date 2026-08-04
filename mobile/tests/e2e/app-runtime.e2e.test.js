// Teste end-to-end real de navegador (Playwright + Microsoft Edge do
// sistema, `channel: 'msedge'` — não baixa Chromium extra). Diferente de
// tests/integration/*.test.js (jsdom, sem renderização real de CSS/layout),
// este teste abre a página servida pelo Vite em um navegador de verdade e
// clica nos controles reais — é o único teste que teria pego o bug de CSS
// (.hidden sem efeito por causa de `display:flex` incondicional) e o bug de
// TransportBar inacessível durante a apresentação, ambos corrigidos nesta
// recuperação (ver ETAPA_5C_RUNTIME_RECOVERY_REPORT.md).
//
// Sobe seu próprio servidor Vite (child process) numa porta dedicada, para
// não depender de um servidor já rodando nem colidir com `npm run dev`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(__dirname, '../..');
const FIXTURE_IMAGE = path.resolve(__dirname, '../fixtures/sample-image.png');
const PORT = 5199;
const BASE_URL = `http://127.0.0.1:${PORT}/`;

function waitForServer(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`Servidor Vite não respondeu em ${url} dentro do timeout`));
        else setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

async function withDevServer(fn) {
  const viteBin = path.resolve(MOBILE_ROOT, 'node_modules/vite/bin/vite.js');
  const child = spawn(
    process.execPath,
    [viteBin, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: MOBILE_ROOT, stdio: 'pipe' },
  );
  let serverOutput = '';
  child.stdout?.on('data', (d) => { serverOutput += d.toString(); });
  child.stderr?.on('data', (d) => { serverOutput += d.toString(); });
  try {
    await waitForServer(BASE_URL);
    await fn();
  } catch (error) {
    error.message += `\n--- saída do servidor Vite ---\n${serverOutput}`;
    throw error;
  } finally {
    child.kill();
  }
}

test('fluxo completo em navegador real: abrir → importar → playlist → apresentar → blackout → editor', { timeout: 60000 }, async () => {
  await withDevServer(async () => {
    const browser = await chromium.launch({ channel: 'msedge' });
    const context = await browser.newContext();
    const page = await context.newPage();

    // /favicon.ico é pedido automaticamente pelo navegador; index.html não
    // declara nenhum favicon (fora do escopo desta correção) — ruído
    // esperado, não uma falha do app. Único filtro aplicado, pela URL real
    // do recurso (msg.location().url), não pelo texto genérico da mensagem.
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const location = msg.location()?.url || '';
      if (location.endsWith('/favicon.ico')) return;
      consoleErrors.push(`${msg.text()} (${location})`);
    });
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('requestfailed', (request) => {
      if (request.url().endsWith('/favicon.ico')) return;
      failedRequests.push(`${request.url()} (${request.failure()?.errorText})`);
    });

    try {
      await page.goto(BASE_URL, { waitUntil: 'load' });

      // 2. espera o loading terminar (o elemento continua no DOM, só ganha o
      // atributo hidden — por isso "attached", não o "visible" padrão)
      await page.waitForSelector('#boot-loading[hidden]', { state: 'attached', timeout: 10000 });
      // 4. editor visível
      const appRoot = page.locator('#app-root');
      await assert.doesNotReject(appRoot.waitFor({ state: 'visible', timeout: 5000 }));
      await assert.doesNotReject(page.locator('#boot-error[hidden]').waitFor({ state: 'attached', timeout: 5000 }));

      // 5-6. importar uma imagem fixture real
      const fileInputPromise = page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 5000 }).catch(() => null);
      await page.getByRole('button', { name: 'Importar mídia do aparelho' }).click();
      const fileInput = await fileInputPromise || page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(FIXTURE_IMAGE);

      // 7. confirma que aparece na playlist
      await page.waitForSelector('text=1 arquivo(s) importado(s)', { timeout: 5000 });
      const playlistItem = page.locator('.editor-item', { hasText: 'sample-image.png' }).first();
      await assert.doesNotReject(playlistItem.waitFor({ state: 'visible', timeout: 5000 }));

      // 8. editar duração do item (o painel de edição é expansível — Etapa 11)
      await playlistItem.locator('.editor-more').click();
      const durationInput = playlistItem.locator('input[type="number"]').first();
      await durationInput.fill('7');
      await durationInput.blur();

      // 9-10. iniciar apresentação e confirmar que a imagem aparece
      await playlistItem.locator('.editor-item-present').click();
      await page.waitForSelector('.presenter-media', { timeout: 5000 });
      await page.waitForFunction(
        () => document.querySelector('.presenter-media')?.naturalWidth > 0,
        { timeout: 5000 },
      );
      const naturalSize = await page.locator('.presenter-media').evaluate((img) => [img.naturalWidth, img.naturalHeight]);
      assert.deepEqual(naturalSize, [1, 1], 'a imagem real deve ter sido decodificada pelo navegador (1x1, fixture conhecida)');

      // 11. aciona blackout — precisa continuar acessível durante a apresentação
      await page.getByRole('button', { name: 'Ativar blackout' }).click();
      const blackoutHidden = await page.locator('.presenter-blackout').evaluate((el) => el.hidden);
      assert.equal(blackoutHidden, false, 'blackout deve ficar visível (bug corrigido: TransportBar não pode ficar hidden durante a apresentação)');

      // 12. retira blackout
      await page.getByRole('button', { name: 'Exibir logo' }).click();
      const blackoutHiddenAfterLogo = await page.locator('.presenter-blackout').evaluate((el) => el.hidden);
      assert.equal(blackoutHiddenAfterLogo, true);

      // 13. volta à navegação normal (Playlist), fullscreen escondido
      await page.getByRole('button', { name: 'Sair da apresentação' }).click();
      await assert.doesNotReject(appRoot.locator('.editor-root').waitFor({ state: 'visible', timeout: 5000 }));
      const presenterHidden = await page.locator('.app-screen-presentation-fullscreen').evaluate((el) => el.hidden);
      assert.equal(presenterHidden, true);
      const bottomNavHidden = await page.locator('.bottom-nav').evaluate((el) => el.hidden);
      assert.equal(bottomNavHidden, false, 'bottom nav deve reaparecer ao sair da apresentação');

      // 14. página continua responsiva: título ainda reflete a app real
      assert.equal(await page.title(), 'FBS Screen Manager — Mobile');

      assert.deepEqual(pageErrors, [], `nenhuma exceção JS não tratada é aceitável: ${pageErrors.join('; ')}`);
      assert.deepEqual(consoleErrors, [], `nenhum console.error é aceitável: ${consoleErrors.join('; ')}`);
      assert.deepEqual(failedRequests, [], `nenhuma request deve falhar: ${failedRequests.join('; ')}`);
    } finally {
      await browser.close();
    }
  });
});
