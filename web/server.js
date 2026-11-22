'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { StudioStore, StudioError } = require('./store');
const { json } = require('./http-utils');
const { createSessions } = require('./sessions');
const { createApi } = require('./api');
const { createMedia } = require('./media');

const VERSION = require('./package.json').version;
const ASSETS = {
  '/': ['studio.html', 'text/html; charset=utf-8'],
  '/studio': ['studio.html', 'text/html; charset=utf-8'],
  '/tv': ['player.html', 'text/html; charset=utf-8'],
  '/studio.css': ['studio.css', 'text/css; charset=utf-8'],
  '/studio.js': ['studio.js', 'application/javascript; charset=utf-8'],
  '/player.css': ['player.css', 'text/css; charset=utf-8'],
  '/player.js': ['player.js', 'application/javascript; charset=utf-8'],
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

async function createStudioServer(options = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const publicOrigin = new URL(options.publicOrigin || process.env.FBS_PUBLIC_ORIGIN || `http://localhost:${process.env.PORT || 8788}`).origin;
  const dataDir = path.resolve(options.dataDir || process.env.FBS_DATA_DIR || path.join(__dirname, '..', '.maestro', 'fbs-studio-data'));
  const adminPassword = options.adminPassword || process.env.FBS_ADMIN_PASSWORD;
  if (production) {
    if (!options.dataDir && !path.isAbsolute(process.env.FBS_DATA_DIR || '')) throw new Error('FBS_DATA_DIR deve ser um caminho absoluto privado.');
    const normalized = dataDir.replaceAll('\\', '/').toLowerCase();
    const relative = path.relative(__dirname, dataDir);
    if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) || /(?:^|\/)(public_html|hbuilds)(?:\/|$)/.test(normalized)) {
      throw new Error('FBS_DATA_DIR deve ficar fora da aplicação, public_html e hbuilds.');
    }
    if (!publicOrigin.startsWith('https://')) throw new Error('FBS_PUBLIC_ORIGIN deve usar HTTPS em produção.');
  }
  const secureCookies = options.secureCookies ?? publicOrigin.startsWith('https://');
  const store = await StudioStore.open({ dataDir, adminPassword, now: options.now || Date.now });
  const sessions = createSessions({ store, publicOrigin, secureCookies });
  const api = createApi({ store, publicOrigin, secureCookies, sessions });
  const media = createMedia({ store, publicOrigin, authorize: sessions.authorize, csrf: sessions.csrf });
  await media.ready;
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const url = new URL(req.url, publicOrigin);
      if (url.pathname === '/health' && ['GET', 'HEAD'].includes(req.method)) {
        if (req.method === 'HEAD') { res.writeHead(200); res.end(); }
        else json(res, 200, { ok: true, app: 'fbs-studio', version: VERSION });
        return;
      }
      if (url.pathname.startsWith('/api/v1/')) {
        if (await sessions.handle(req, res, url) || await api(req, res, url) || await media(req, res, url)) return;
        throw new StudioError(404, 'Este recurso não existe.', 'NOT_FOUND');
      }
      if (['GET', 'HEAD'].includes(req.method)) {
        let asset;
        if (url.pathname === '/vendor/qrcode.js') asset = [require.resolve('qrcode-generator'), 'application/javascript; charset=utf-8'];
        else if (Object.hasOwn(ASSETS, url.pathname)) asset = [path.join(__dirname, 'public', ASSETS[url.pathname][0]), ASSETS[url.pathname][1]];
        if (asset) {
          const bytes = await fs.readFile(asset[0]);
          res.writeHead(200, { 'Content-Type': asset[1], 'Content-Length': bytes.length });
          res.end(req.method === 'HEAD' ? undefined : bytes);
          return;
        }
      }
      throw new StudioError(404, 'Esta página não existe.', 'NOT_FOUND');
    } catch (error) {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) { res.destroy(); return; }
      const known = error instanceof StudioError;
      if (!known) console.error('FBS Studio:', error);
      json(res, known ? error.status : 500, {
        error: known ? error.message : 'Não foi possível concluir o pedido. Tente novamente.',
        ...(!known ? { code: 'INTERNAL_ERROR' } : error.code ? { code: error.code } : {}),
        ...(known && error.details && typeof error.details === 'object' ? error.details : {}),
      });
    }
  });
  server.requestTimeout = 110000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 80;
  let closing;
  async function close() {
    if (closing) return closing;
    closing = (async () => {
      if (server.listening) {
        await new Promise((resolve, reject) => {
          server.close(error => error ? reject(error) : resolve());
          server.closeIdleConnections();
        });
      }
      await api.close?.();
      await sessions.close?.();
      await store.close();
    })();
    return closing;
  }
  return { server, store, close };
}

async function startStudio() {
  const app = await createStudioServer();
  const port = Number(process.env.PORT || 8788);
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(port, '0.0.0.0', resolve);
  });
  console.log(`FBS Studio ${VERSION} em ${process.env.FBS_PUBLIC_ORIGIN || `http://localhost:${port}`}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().then(() => process.exit(0), error => { console.error(error); process.exit(1); }));
  return app;
}

if (require.main === module) startStudio().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { createStudioServer, startStudio };
