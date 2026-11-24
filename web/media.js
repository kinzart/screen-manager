'use strict';

const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { StudioError, json, readJson } = require('./http-utils');
const { resolveScreenOutput } = require('./screen-output');

const CHUNK = 2 * 1024 * 1024;
const HASH_CHUNK = 8 * 1024 * 1024; // blocos verificáveis pelo receptor (cache)
const MAX_FILE = 512 * 1024 * 1024;
const QUOTA = 2 * 1024 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TYPES = {
  'image/png': ['image', 'png'], 'image/jpeg': ['image', 'jpg'],
  'image/webp': ['image', 'webp'], 'image/gif': ['image', 'gif'],
  'video/mp4': ['video', 'mp4'], 'video/webm': ['video', 'webm'],
};
function owns(collection, id) { return typeof id === 'string' && UUID.test(id) && Object.hasOwn(collection, id) ? collection[id] : null; }
function sniff(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
  if (buffer.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) return 'video/webm';
  return null;
}

// SHA-256 do arquivo inteiro e de cada bloco de HASH_CHUNK, em streaming (memória limitada a um bloco de leitura).
async function hashFile(file) {
  const whole = createHash('sha256');
  const chunks = [];
  let block = createHash('sha256');
  let filled = 0;
  for await (const data of createReadStream(file, { highWaterMark: 1024 * 1024 })) {
    whole.update(data);
    let offset = 0;
    while (offset < data.length) {
      const take = Math.min(HASH_CHUNK - filled, data.length - offset);
      block.update(data.subarray(offset, offset + take));
      filled += take;
      offset += take;
      if (filled === HASH_CHUNK) { chunks.push(block.digest('hex')); block = createHash('sha256'); filled = 0; }
    }
  }
  if (filled) chunks.push(block.digest('hex'));
  return { sha256: whole.digest('hex'), chunkSize: HASH_CHUNK, chunks };
}

function createMedia({ store, authorize, csrf }) {
  const uploadsDir = path.join(store.dataDir, 'uploads');
  const mediaDir = path.join(store.dataDir, 'media');
  const busy = new Set();
  const planMedia = new Map();
  let patches = 0;
  const temporary = id => path.join(uploadsDir, `${id}.part`);
  const mediaPath = media => path.join(mediaDir, `${media.id}.${media.extension}`);
  const ready = (async () => {
    await Promise.all([fs.mkdir(uploadsDir, { recursive: true, mode: 0o700 }), fs.mkdir(mediaDir, { recursive: true, mode: 0o700 })]);
    for (const upload of Object.values(store.db.uploads)) {
      if (!owns(store.db.uploads, upload.id) || typeof upload.mime !== 'string' || !Object.hasOwn(TYPES, upload.mime)) continue;
      let stat;
      try { stat = await fs.stat(temporary(upload.id)); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        // A crash after rename and before the metadata commit must remain resumable.
        if (upload.offset === upload.size && !owns(store.db.media, upload.id)) {
          const destination = path.join(mediaDir, `${upload.id}.${TYPES[upload.mime][1]}`);
          try { await fs.rename(destination, temporary(upload.id)); stat = await fs.stat(temporary(upload.id)); }
          catch (recoveryError) { if (recoveryError.code !== 'ENOENT') throw recoveryError; }
        }
      }
      if (stat && stat.size > upload.offset) await fs.truncate(temporary(upload.id), upload.offset);
    }
    for (const entry of await fs.readdir(uploadsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.part')) continue;
      const id = entry.name.slice(0, -5);
      if (UUID.test(id) && !owns(store.db.uploads, id)) await fs.unlink(temporary(id));
    }
  })();
  function authorizeMedia(req, role, media) {
    const session = authorize(req, role);
    if (role === 'screen') {
      // Permitido: mídias do plano da tela (sessão atual e próximas do horizonte), para o pré-carregamento.
      const key = `${store.db.revision}:${session.screenId}:${Math.floor(store.now() / 30000)}`;
      let allowed = planMedia.get(key);
      if (!allowed) {
        allowed = resolveScreenOutput(store.db, session.screenId, store.now())?.mediaIds ?? new Set();
        if (planMedia.size > 256) planMedia.clear();
        planMedia.set(key, allowed);
      }
      if (!allowed.has(media.id)) throw new StudioError(403, 'Esta mídia não pertence à programação desta tela.', 'MEDIA_DENIED');
    }
  }
  async function syncMediaDirectories() {
    if (process.platform === 'win32') return;
    for (const directory of [uploadsDir, mediaDir]) {
      const handle = await fs.open(directory, 'r');
      try { await handle.sync(); }
      finally { await handle.close(); }
    }
  }
  function uploadFor(id) {
    const upload = owns(store.db.uploads, id);
    if (!upload) throw new StudioError(404, 'O envio não existe ou já foi concluído.', 'UPLOAD_NOT_FOUND');
    return upload;
  }
  function reserve(id) {
    if (busy.has(id)) throw new StudioError(409, 'Este arquivo já está sendo atualizado.', 'UPLOAD_BUSY');
    busy.add(id);
  }
  function descriptor(upload) { return { id: upload.id, offset: upload.offset, size: upload.size, chunkSize: CHUNK }; }

  async function handle(req, res, url) {
    const route = url.pathname;
    if (!route.startsWith('/api/v1/uploads') && !route.startsWith('/api/v1/media/')) return false;
    await ready;
    const fileMatch = route.match(/^\/api\/v1\/media\/([^/]+)$/);
    if (fileMatch && ['GET', 'HEAD'].includes(req.method)) {
      const role = url.searchParams.get('role') === 'screen' ? 'screen' : 'operator';
      authorize(req, role);
      const media = owns(store.db.media, fileMatch[1]);
      if (!media) throw new StudioError(404, 'A mídia não existe.', 'MEDIA_NOT_FOUND');
      authorizeMedia(req, role, media);
      let stat;
      try { stat = await fs.stat(mediaPath(media)); }
      catch (error) { if (error.code === 'ENOENT') throw new StudioError(404, 'O arquivo desta mídia está indisponível.', 'MEDIA_MISSING'); throw error; }
      let start = 0;
      let end = stat.size - 1;
      let status = 200;
      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        let valid = Boolean(match && (match[1] || match[2]) && stat.size);
        if (valid && !match[1]) {
          const suffix = Number(match[2]);
          valid = Number.isSafeInteger(suffix) && suffix > 0;
          start = Math.max(0, stat.size - suffix);
        } else if (valid) {
          start = Number(match[1]);
          end = match[2] ? Number(match[2]) : end;
          valid = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start < stat.size && end >= start;
          end = Math.min(end, stat.size - 1);
        }
        if (!valid) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}`, 'Content-Length': '0', 'Cache-Control': 'no-store' });
          res.end();
          return true;
        }
        status = 206;
      }
      authorizeMedia(req, role, media);
      res.writeHead(status, {
        'Content-Type': media.mime, 'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
        ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${stat.size}` } : {}),
      });
      if (req.method === 'HEAD') res.end();
      else {
        const stream = createReadStream(mediaPath(media), { start, end });
        res.on('close', () => stream.destroy());
        stream.on('error', () => res.destroy());
        stream.pipe(res);
      }
      return true;
    }

    const session = authorize(req, 'operator');
    if (!['GET', 'HEAD'].includes(req.method)) csrf(req, session);
    if (route === '/api/v1/uploads' && req.method === 'POST') {
      const body = await readJson(req);
      if (!owns(store.db.spaces, body.spaceId)) throw new StudioError(400, 'Escolha um espaço válido.', 'INVALID_SPACE');
      if (!Number.isSafeInteger(body.size) || body.size <= 0 || body.size > MAX_FILE) throw new StudioError(413, 'Cada arquivo deve ter entre 1 byte e 512 MB.', 'FILE_TOO_LARGE');
      if (typeof body.mime !== 'string' || !Object.hasOwn(TYPES, body.mime)) throw new StudioError(415, 'Use imagens PNG, JPG, WebP, GIF ou vídeos MP4 e WebM.', 'MEDIA_TYPE');
      const name = typeof body.name === 'string' ? body.name.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 180) : '';
      if (!name) throw new StudioError(400, 'Informe um nome de arquivo.', 'INVALID_NAME');
      const id = randomUUID();
      const upload = { id, spaceId: body.spaceId, name, size: body.size, mime: body.mime, offset: 0, createdAt: store.now(), updatedAt: store.now() };
      const handle = await fs.open(temporary(id), 'wx', 0o600);
      await handle.close();
      try {
        await store.change(db => {
          const pending = Object.values(db.uploads).filter(item => item.spaceId === body.spaceId);
          const used = Object.values(db.media).filter(item => item.spaceId === body.spaceId).reduce((sum, item) => sum + item.size, 0) + pending.reduce((sum, item) => sum + item.size, 0);
          if (used + body.size > QUOTA) throw new StudioError(413, 'Este espaço atingiu a capacidade de 2 GB.', 'SPACE_QUOTA');
          if (pending.length >= 64 || Object.keys(db.uploads).length >= 256) throw new StudioError(429, 'Conclua ou remova envios pendentes antes de iniciar outro.', 'UPLOAD_LIMIT');
          db.uploads[id] = upload;
        });
      } catch (error) { await fs.unlink(temporary(id)).catch(() => {}); throw error; }
      json(res, 201, descriptor(upload));
      return true;
    }
    const match = route.match(/^\/api\/v1\/uploads\/([^/]+)(\/complete)?$/);
    if (!match) return false;
    const id = match[1];
    let upload = uploadFor(id);
    if (req.method === 'GET' && !match[2]) { json(res, 200, descriptor(upload)); return true; }
    if (req.method === 'PATCH' && !match[2]) {
      if ((req.headers['content-type'] || '').split(';')[0] !== 'application/octet-stream') throw new StudioError(415, 'Envie um bloco binário do arquivo.', 'BINARY_REQUIRED');
      const offset = req.headers['upload-offset'];
      if (!/^\d+$/.test(offset || '') || Number(offset) !== upload.offset) {
        req.resume();
        res.setHeader('Upload-Offset', upload.offset);
        json(res, 409, { error: 'Retome o envio a partir do último bloco confirmado.', code: 'OFFSET_CONFLICT', offset: upload.offset });
        return true;
      }
      if (patches >= 2) throw new StudioError(429, 'Aguarde um dos dois envios em andamento.', 'UPLOAD_CONCURRENCY');
      if (Number(req.headers['content-length']) > Math.min(CHUNK, upload.size - upload.offset)) {
        req.resume();
        throw new StudioError(413, 'O bloco excedeu o limite do envio.', 'CHUNK_TOO_LARGE');
      }
      reserve(id);
      patches++;
      let file;
      let written = 0;
      let committed = false;
      try {
        file = await fs.open(temporary(id), 'r+');
        if ((await file.stat()).size < upload.offset) throw new StudioError(409, 'O arquivo temporário está incompleto. Reinicie este envio.', 'UPLOAD_DAMAGED');
        await file.truncate(upload.offset);
        for await (const chunk of req.iterator({ destroyOnReturn: false })) {
          if (written + chunk.length > CHUNK || upload.offset + written + chunk.length > upload.size) throw new StudioError(413, 'O bloco excedeu o limite do envio.', 'CHUNK_TOO_LARGE');
          let part = 0;
          while (part < chunk.length) {
            const result = await file.write(chunk, part, chunk.length - part, upload.offset + written + part);
            if (!result.bytesWritten) throw new Error('WRITE_STALLED');
            part += result.bytesWritten;
          }
          written += chunk.length;
        }
        if (!written) throw new StudioError(400, 'O bloco está vazio.', 'EMPTY_CHUNK');
        await file.sync();
        await file.close();
        file = null;
        const updated = await store.change(db => {
          if (db.uploads[id].offset !== upload.offset) throw new StudioError(409, 'O envio foi atualizado em outro pedido.', 'OFFSET_CONFLICT');
          db.uploads[id].offset += written;
          db.uploads[id].updatedAt = store.now();
          return db.uploads[id];
        });
        committed = true;
        res.setHeader('Upload-Offset', updated.offset);
        json(res, 200, descriptor(updated));
      } catch (error) {
        req.resume();
        if (error.code === 'ECONNRESET' || error.code === 'ABORT_ERR') throw new StudioError(400, 'O envio foi interrompido; o último bloco pode ser reenviado.', 'UPLOAD_INTERRUPTED');
        throw error;
      } finally {
        await file?.close().catch(() => {});
        if (!committed) await fs.truncate(temporary(id), upload.offset).catch(() => {});
        busy.delete(id);
        patches--;
      }
      return true;
    }
    if (req.method === 'POST' && match[2]) {
      await readJson(req);
      reserve(id);
      let destination;
      let renamed = false;
      let committed = false;
      try {
        upload = uploadFor(id);
        if (upload.offset !== upload.size) throw new StudioError(409, 'O arquivo ainda não foi enviado por completo.', 'UPLOAD_INCOMPLETE');
        const file = await fs.open(temporary(id), 'r');
        let mime;
        try {
          if ((await file.stat()).size !== upload.size) throw new StudioError(409, 'O tamanho do arquivo não corresponde ao envio.', 'UPLOAD_INCOMPLETE');
          const header = Buffer.alloc(64);
          const { bytesRead } = await file.read(header, 0, header.length, 0);
          mime = sniff(header.subarray(0, bytesRead));
        } finally { await file.close(); }
        if (!mime || mime !== upload.mime) throw new StudioError(415, 'O conteúdo do arquivo não corresponde ao formato informado.', 'INVALID_MEDIA');
        const [type, extension] = TYPES[mime];
        const integrity = await hashFile(temporary(id));
        const media = { id, spaceId: upload.spaceId, name: upload.name, type, mime, extension, size: upload.size, createdAt: store.now(), ...integrity };
        destination = mediaPath(media);
        await fs.rename(temporary(id), destination);
        renamed = true;
        await syncMediaDirectories();
        await store.change(db => { db.media[id] = media; delete db.uploads[id]; });
        committed = true;
        json(res, 201, media);
      } finally {
        try { if (renamed && !committed) await fs.rename(destination, temporary(id)); }
        finally { busy.delete(id); }
      }
      return true;
    }
    if (req.method === 'DELETE' && !match[2]) {
      reserve(id);
      try {
        await store.change(db => { delete db.uploads[id]; });
        await fs.unlink(temporary(id)).catch(error => { if (error.code !== 'ENOENT') throw error; });
        json(res, 200, { ok: true });
      } finally { busy.delete(id); }
      return true;
    }
    return false;
  }
  // Mídias anteriores ao esquema 2: hash em segundo plano, uma por vez, sem bloquear a abertura.
  let hashing = Promise.resolve();
  handle.backfill = () => {
    hashing = hashing.then(async () => {
      for (const media of Object.values(store.db.media)) {
        if (media.sha256 || store._closed) continue;
        try {
          const integrity = await hashFile(mediaPath(media));
          await store.change(db => { if (db.media[media.id] && !db.media[media.id].sha256) Object.assign(db.media[media.id], integrity); });
        } catch (error) {
          if (store._closed) return;
          if (error.code !== 'ENOENT') console.error('FBS Studio: hash de mídia', media.id, error.message);
        }
      }
    });
    return hashing;
  };
  // Apaga do disco arquivos de mídias e envios já removidos do estado (exclusão de mídia ou de espaço).
  handle.removeFiles = async ({ media = [], uploads = [] } = {}) => {
    const ignoreMissing = error => { if (error.code !== 'ENOENT') console.error('FBS Studio: remoção de arquivo', error.message); };
    for (const item of media) {
      planMedia.clear();
      await fs.unlink(mediaPath(item)).catch(ignoreMissing);
    }
    for (const id of uploads) await fs.unlink(temporary(id)).catch(ignoreMissing);
  };
  handle.ready = ready;
  return handle;
}

module.exports = { createMedia, hashFile, CHUNK, HASH_CHUNK, MAX_FILE, QUOTA };
