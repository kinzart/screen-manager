const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');

const mediaTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const uploadLimit = 256 * 1024 * 1024;
const roles = ['control', 'tv'];
const assets = {
  '/': ['live/control.html', 'text/html'], '/tv': ['live/tv.html', 'text/html'],
  '/live/client.js': ['live/client.js', 'text/javascript'], '/live/control.js': ['live/control.js', 'text/javascript'],
  '/sw.js': ['live/sw.js', 'text/javascript'],
  '/live/live.css': ['live/live.css', 'text/css'], '/display.js': ['display.js', 'text/javascript'],
  '/display.css': ['display.css', 'text/css'], '/logo-bs.png': ['logo-bs.png', 'image/png'],
  '/live/icon-192.png': ['live/icon-192.png', 'image/png'], '/live/icon-512.png': ['live/icon-512.png', 'image/png']
};

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
function sameOrigin(req) {
  if (!req.headers.origin) return true;
  try {
    const host = new URL(req.headers.origin).host;
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    return host === req.headers.host || (loopback && host === req.headers['x-forwarded-host']);
  } catch { return false; }
}
async function streamMedia(req, res, item) {
  const type = item && mediaTypes[path.extname(item.path).toLowerCase()];
  if (!type) throw fail(404, 'Mídia fora da fila.');
  const file = await fs.promises.open(item.path, 'r').catch(() => { throw fail(404, 'Arquivo indisponível.'); });
  try {
    const { size } = await file.stat();
    let start = 0, end = size - 1;
    if (req.headers.range) {
      const parts = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (parts && (parts[1] || parts[2])) {
        start = parts[1] ? Number(parts[1]) : Math.max(0, size - Number(parts[2]));
        if (parts[1] && parts[2]) end = Math.min(end, Number(parts[2]));
      } else start = size;
      if (start >= size || start > end) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + size }); res.end(); return;
      }
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    }
    res.writeHead(req.headers.range ? 206 : 200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD' || size === 0) { res.end(); return; }
    const stream = file.createReadStream({ start, end, autoClose: false });
    await new Promise(resolve => {
      res.once('close', resolve);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    });
    stream.destroy();
  } finally { await file.close(); }
}

function createLiveServer({ secret, srcDir, uploadDir, snapshot, media, dispatch, imported, onChange = () => {} }) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
  const httpClients = new Set(), attempts = new Map();
  const tokens = Object.fromEntries(roles.map(role => [role, crypto.createHmac('sha256', secret).update(role).digest('hex')]));
  let codes, expires, closed = false, pending, uploads = 0;
  function renew() {
    codes = Object.fromEntries(roles.map(role => [role, String(crypto.randomInt(10_000_000, 100_000_000))]));
    if (codes.tv === codes.control) return renew();
    expires = Date.now() + 10 * 60_000;
    return info();
  }
  function info() {
    return { codes: Date.now() < expires ? { ...codes } : {}, expires,
      controls: [...sockets.clients].filter(ws => ws.role === 'control').length,
      televisions: [...sockets.clients].filter(ws => ws.role === 'tv').length };
  }
  function paired(req, role) {
    return roles.includes(role) && (req.headers.cookie || '').split(/;\s*/).includes('fbs_' + role + '=' + tokens[role]);
  }
  async function pair(req, res) {
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw fail(415, 'Envie o código de acesso.');
    const key = req.socket.remoteAddress;
    const limit = attempts.get(key);
    if (limit && limit.until > Date.now() && limit.count >= 8) throw fail(429, 'Aguarde um minuto para tentar novamente.');
    let input = '';
    for await (const chunk of req) {
      if (input.length + chunk.length > 512) throw fail(413, 'Pedido muito grande.');
      input += chunk.toString();
    }
    let pair;
    try { pair = JSON.parse(input); } catch { throw fail(400, 'Código inválido.'); }
    const { role, code } = pair || {};
    if (!roles.includes(role) || typeof code !== 'string' || !code || code !== codes[role] || Date.now() >= expires) {
      attempts.set(key, limit && limit.until > Date.now() ? { ...limit, count: limit.count + 1 } : { count: 1, until: Date.now() + 60_000 });
      throw fail(403, 'Confira o código de oito dígitos no computador ou gere um novo.');
    }
    codes[role] = null;
    attempts.delete(key);
    const secure = req.socket.encrypted || req.headers.origin?.startsWith('https://');
    res.setHeader('Set-Cookie', `fbs_${role}=${tokens[role]}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure ? '; Secure' : ''}`);
    json(res, 200, { ok: true });
    onChange();
  }
  async function upload(req, res, url) {
    if (!paired(req, 'control')) throw fail(403, 'Pareie o controle neste navegador.');
    if (uploads >= 2) throw fail(429, 'Aguarde o envio em andamento.');
    const name = (url.searchParams.get('name') || '').split(/[/\\]/).pop().slice(0, 240);
    const ext = path.extname(name).toLowerCase();
    if (!Object.hasOwn(mediaTypes, ext)) throw fail(415, 'Use PNG, JPG, WEBP, GIF, MP4 ou WEBM.');
    if (Number(req.headers['content-length']) > uploadLimit) throw fail(413, 'O limite por arquivo é 256 MB.');
    const file = path.join(uploadDir, crypto.randomUUID() + ext);
    let handle, handedOff = false, length = 0;
    uploads++;
    try {
      await fs.promises.mkdir(uploadDir, { recursive: true });
      handle = await fs.promises.open(file, 'wx');
      for await (const chunk of req) {
        length += chunk.length;
        if (length > uploadLimit) throw fail(413, 'O limite por arquivo é 256 MB.');
        await handle.writeFile(chunk);
      }
      if (!length || closed) throw fail(400, 'Envio interrompido.');
      await handle.close(); handle = null;
      await imported(file, name);
      handedOff = true;
      json(res, 201, { ok: true });
    } finally {
      uploads--;
      if (handle) await handle.close();
      if (!handedOff) await fs.promises.unlink(file).catch(() => {});
    }
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      if (!sameOrigin(req)) throw fail(403, 'Origem inválida.');
      if (req.method === 'POST' && route === '/api/pair') return await pair(req, res);
      if (req.method === 'POST' && route === '/api/upload') return await upload(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw fail(405, 'Método indisponível.');
      if (route === '/api/session') return json(res, 200, { paired: paired(req, url.searchParams.get('role')) });
      if (route.startsWith('/api/media/')) {
        if (!roles.some(role => paired(req, role))) throw fail(403, 'Pareamento necessário.');
        return await streamMedia(req, res, media(decodeURIComponent(route.slice('/api/media/'.length))));
      }
      if (route === '/tv.webmanifest' || route === '/control.webmanifest') {
        const tv = route === '/tv.webmanifest';
        return json(res, 200, { id: tv ? '/tv' : '/', start_url: tv ? '/tv' : '/', scope: '/',
          name: tv ? 'FBS · Tela de exibição' : 'FBS · Controle de exibição', short_name: tv ? 'FBS Tela' : 'FBS Controle',
          display: tv ? 'fullscreen' : 'standalone', background_color: '#11110f', theme_color: '#191916',
          icons: [192, 512].map(size => ({ src: '/live/icon-' + size + '.png', sizes: size + 'x' + size, type: 'image/png' })) });
      }
      if (!Object.hasOwn(assets, route)) throw fail(404, 'Endereço indisponível.');
      const [relative, type] = assets[route];
      const data = await fs.promises.readFile(path.join(srcDir, relative));
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length }); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (res.headersSent) res.destroy();
      else if (!res.destroyed) json(res, error.status || 500, { error: error.status ? error.message : 'Operação indisponível no computador.' });
    }
  });
  server.on('connection', socket => { httpClients.add(socket); socket.once('close', () => httpClients.delete(socket)); });
  server.on('upgrade', (req, socket, head) => {
    const role = /^\/live\/(control|tv)$/.exec(req.url)?.[1];
    if (!sameOrigin(req) || !paired(req, role) || sockets.clients.size >= 40) { socket.destroy(); return; }
    sockets.handleUpgrade(req, socket, head, ws => {
      ws.role = role; ws.alive = true;
      ws.on('error', () => ws.terminate());
      ws.on('pong', () => { ws.alive = true; });
      ws.on('close', onChange);
      ws.on('message', async buffer => {
        if (role !== 'control') { ws.close(1008); return; }
        let request;
        try {
          request = JSON.parse(buffer.toString());
          if (!Number.isSafeInteger(request?.id)) throw new Error('Pedido inválido.');
          await dispatch(request.command);
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ack: request.id }));
        } catch (error) {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ack: request?.id ?? null, error: error.message }));
        }
      });
      ws.send(JSON.stringify({ state: snapshot(role) }));
      onChange();
    });
  });
  const health = setInterval(() => {
    for (const ws of sockets.clients) {
      if (!ws.alive) ws.terminate();
      else { ws.alive = false; ws.ping(); }
    }
    for (const [key, entry] of attempts) if (entry.until <= Date.now()) attempts.delete(key);
  }, 15000);
  health.unref();
  renew();
  return {
    info, renew,
    listen(port = 8790, host = '0.0.0.0') {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => { server.off('error', reject); resolve(server.address().port); });
      });
    },
    update() {
      if (closed || pending || !sockets.clients.size) return;
      pending = setImmediate(() => {
        pending = null;
        const frames = {};
        for (const ws of sockets.clients) {
          if (ws.readyState !== WebSocket.OPEN) continue;
          if (ws.bufferedAmount > 256 * 1024) { ws.terminate(); continue; }
          frames[ws.role] ??= JSON.stringify({ state: snapshot(ws.role) });
          ws.send(frames[ws.role]);
        }
      });
    },
    close() {
      closed = true; clearImmediate(pending); clearInterval(health);
      for (const ws of sockets.clients) ws.terminate();
      for (const socket of httpClients) socket.destroy();
      sockets.close();
      return new Promise(resolve => server.close(resolve));
    }
  };
}

module.exports = { createLiveServer, mediaTypes };
