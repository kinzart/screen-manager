// Servidor de retransmissão do controle remoto — FBS Screen Manager.
//
// Papel: liga o celular (controle) à TV (exibição, aberta no navegador da
// própria TV/Chromecast/Fire TV/Android TV) sem depender de nenhum
// notebook. Os dois lados só precisam de internet — nenhuma rede local
// compartilhada é exigida.
//
// Arquitetura:
// - A TV abre `/display`, o servidor gera um código de sala (4 dígitos) e
//   o exibe grande na tela.
// - O celular (app mobile, RemoteDesktopAdapter) digita esse código e
//   conecta como "controller" na mesma sala via WebSocket.
// - Comandos (show/blackout/logo/pause/resume/clear) do controller são
//   retransmitidos para o display da mesma sala.
// - Upload de mídia: o celular envia os bytes do arquivo para
//   `/api/rooms/:room/media`; o servidor guarda em disco (armazenamento
//   efêmero — depende do provedor de hospedagem, aceitável para uso
//   pessoal) e devolve uma URL que o comando "show" referencia; a TV
//   busca essa URL como um <img>/<video> normal.
//
// Sem dependência de banco de dados: tudo em memória (Map). Uma sala
// morre quando o display desconecta.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8787;
const DATA_DIR = process.env.REMOTE_DATA_DIR || path.join(__dirname, 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SUPPORTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']);
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB — limite de segurança, não uma promessa de performance
const ROOM_CODE_TTL_MS = 6 * 60 * 60 * 1000; // sala sem display conectado expira em 6h
const WS_HEARTBEAT_MS = 30 * 1000;
const REQUIRE_TOKENS = /^(1|true|yes)$/i.test(String(process.env.REMOTE_REQUIRE_TOKENS || ''));

fs.mkdirSync(MEDIA_DIR, { recursive: true });

/** @type {Map<string, {displayWs: any, controllers: Set<any>, media: Map<string,{file:string,mime:string}>, createdAt: number}>} */
const rooms = new Map();

function createToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateRoomCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Media-Mime, X-Media-Name',
  });
  res.end(body);
}

function notFound(res) {
  json(res, 404, { error: 'not_found' });
}

function serveStaticFile(res, filePath, contentType) {
  fs.readFile(filePath, (error, content) => {
    if (error) return notFound(res);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

function extFromMime(mime) {
  const map = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/webm': 'webm',
  };
  return map[mime] || 'bin';
}

function broadcastToRoomControllers(room, payload) {
  const message = JSON.stringify(payload);
  for (const ws of room.controllers) {
    if (ws.readyState === ws.OPEN) ws.send(message);
  }
}

function requestToken(req, url) {
  const authorization = String(req.headers.authorization || '');
  if (/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, '').trim();
  return url.searchParams.get('token') || '';
}

function hasRoleToken(req, url, room, role) {
  if (!REQUIRE_TOKENS) return true;
  return requestToken(req, url) === room.tokens?.[role];
}

function hasAnyRoomToken(req, url, room) {
  if (!REQUIRE_TOKENS) return true;
  const token = requestToken(req, url);
  return token === room.tokens?.display || token === room.tokens?.controller || token === room.tokens?.desktop;
}

function sendToDisplay(room, payload) {
  if (room.displayWs && room.displayWs.readyState === room.displayWs.OPEN) {
    room.displayWs.send(JSON.stringify(payload));
  }
}

function sendToDesktop(room, payload) {
  if (room.desktopWs && room.desktopWs.readyState === room.desktopWs.OPEN) {
    room.desktopWs.send(JSON.stringify(payload));
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Media-Mime,X-Media-Name',
    });
    return res.end();
  }

  // --- páginas estáticas ---
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/display')) {
    return serveStaticFile(res, path.join(PUBLIC_DIR, 'display.html'), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/display.js') {
    return serveStaticFile(res, path.join(PUBLIC_DIR, 'display.js'), 'application/javascript; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/display.css') {
    return serveStaticFile(res, path.join(PUBLIC_DIR, 'display.css'), 'text/css; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, rooms: rooms.size });
  }

  // --- criar sala (chamado pela página /display ao carregar) ---
  if (req.method === 'POST' && url.pathname === '/api/rooms') {
    const code = generateRoomCode();
    const displayToken = createToken();
    const controllerToken = createToken();
    const desktopToken = createToken();
    const expiresAt = Date.now() + ROOM_CODE_TTL_MS;
    rooms.set(code, {
      displayWs: null, desktopWs: null, controllers: new Set(), media: new Map(), createdAt: Date.now(),
      expiresAt, tokens: { display: displayToken, controller: controllerToken, desktop: desktopToken },
    });
    return json(res, 200, {
      room: code,
      displayToken,
      controllerToken,
      desktopToken,
      expiresAt,
      authRequired: REQUIRE_TOKENS,
    });
  }

  // --- upload de mídia (chamado pelo celular) ---
  const uploadMatch = url.pathname.match(/^\/api\/rooms\/(\d{4})\/media$/);
  if (req.method === 'POST' && uploadMatch) {
    const room = rooms.get(uploadMatch[1]);
    if (!room) return json(res, 404, { error: 'room_not_found' });
    if (!hasRoleToken(req, url, room, 'controller')) return json(res, 401, { error: 'controller_token_required' });
    const mime = req.headers['x-media-mime'] || '';
    if (!SUPPORTED_MIME.has(mime)) return json(res, 400, { error: 'unsupported_mime', mime });

    const mediaId = crypto.randomBytes(8).toString('hex');
    const fileName = `${mediaId}.${extFromMime(mime)}`;
    const filePath = path.join(MEDIA_DIR, fileName);
    const writeStream = fs.createWriteStream(filePath);
    let received = 0;
    let aborted = false;

    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > MAX_UPLOAD_BYTES && !aborted) {
        aborted = true;
        writeStream.destroy();
        fs.unlink(filePath, () => {});
        json(res, 413, { error: 'file_too_large' });
        req.destroy();
      }
    });
    req.on('error', () => { if (!aborted) writeStream.destroy(); });
    req.pipe(writeStream);
    writeStream.on('finish', () => {
      if (aborted) return;
      room.media.set(mediaId, { file: fileName, mime });
      const mediaUrl = `/media/${uploadMatch[1]}/${mediaId}` +
        (REQUIRE_TOKENS ? `?token=${encodeURIComponent(room.tokens.display)}` : '');
      json(res, 200, { mediaId, url: mediaUrl });
    });
    writeStream.on('error', () => {
      if (!aborted) json(res, 500, { error: 'write_failed' });
    });
    return;
  }

  // --- servir mídia (chamado pela TV) ---
  const mediaMatch = url.pathname.match(/^\/media\/(\d{4})\/([a-f0-9]+)$/);
  if (req.method === 'GET' && mediaMatch) {
    const room = rooms.get(mediaMatch[1]);
    const entry = room?.media.get(mediaMatch[2]);
    if (!entry) return notFound(res);
    if (!hasAnyRoomToken(req, url, room)) return json(res, 401, { error: 'display_token_required' });
    const filePath = path.join(MEDIA_DIR, entry.file);
    fs.stat(filePath, (error, stat) => {
      if (error) return notFound(res);
      res.writeHead(200, {
        'Content-Type': entry.mime,
        'Content-Length': stat.size,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(filePath).pipe(res);
    });
    return;
  }

  notFound(res);
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const role = url.searchParams.get('role');
  const roomCode = url.searchParams.get('room');
  const room = rooms.get(roomCode);

  if (!room || !['display', 'controller', 'desktop'].includes(role) || !hasRoleToken(req, url, room, role)) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    if (role === 'display') {
      room.displayWs = ws;
      broadcastToRoomControllers(room, { type: 'display-connected' });
    } else if (role === 'desktop') {
      if (room.desktopWs && room.desktopWs !== ws) room.desktopWs.close(4002, 'desktop-replaced');
      room.desktopWs = ws;
      broadcastToRoomControllers(room, { type: 'desktop-connected' });
      ws.send(JSON.stringify({ type: 'state-request' }));
    } else {
      room.controllers.add(ws);
      ws.send(JSON.stringify({ type: 'connected', room: roomCode }));
      if (room.desktopWs) sendToDesktop(room, { type: 'controller-connected' });
      else sendToDisplay(room, { type: 'controller-connected' });
    }
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let payload;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        return; // mensagem inválida — ignorada, nunca derruba a conexão
      }
      if (role === 'controller') {
        // Comando do celular → desktop (preferencial) ou TV browser legado.
        if (room.desktopWs) sendToDesktop(room, payload);
        else sendToDisplay(room, payload);
      } else if (role === 'desktop') {
        // Snapshot/status do desktop → todos os celulares da sala.
        broadcastToRoomControllers(room, payload);
      } else {
        // Status/erro da TV → todos os celulares controlando esta sala.
        broadcastToRoomControllers(room, payload);
      }
    });

    ws.on('close', () => {
      if (role === 'display') {
        room.displayWs = null;
        broadcastToRoomControllers(room, { type: 'display-disconnected' });
      } else if (role === 'desktop') {
        if (room.desktopWs === ws) room.desktopWs = null;
        broadcastToRoomControllers(room, { type: 'desktop-disconnected' });
      } else {
        room.controllers.delete(ws);
      }
    });
  });
});

// Detecta conexões presas atrás de NAT/roteadores e informa o navegador para
// que ele refaça o handshake. Sem ping, uma queda de Wi-Fi pode deixar um
// WebSocket aparentemente aberto por vários minutos.
const heartbeat = setInterval(() => {
  for (const room of rooms.values()) {
    const sockets = [room.displayWs, room.desktopWs, ...room.controllers];
    for (const ws of sockets) {
      if (!ws || ws.readyState !== ws.OPEN) continue;
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }
}, WS_HEARTBEAT_MS);
heartbeat.unref();

// Limpeza periódica: salas cujo display nunca conectou (ou caiu) e já
// passaram do TTL são removidas, junto com a mídia associada.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.displayWs && now - room.createdAt > ROOM_CODE_TTL_MS) {
      for (const entry of room.media.values()) {
        fs.unlink(path.join(MEDIA_DIR, entry.file), () => {});
      }
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000).unref();

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[remote] servidor ouvindo na porta ${PORT}`);
  });
}

module.exports = { server, rooms };
