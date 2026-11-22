'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');
const { StudioError } = require('./store');

function json(res, status, body) {
  const data = JSON.stringify(body ?? {});
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(data);
}

async function readJson(req, max = 65536) {
  if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new StudioError(415, 'Envie os dados no formato JSON.', 'JSON_REQUIRED');
  }
  const declared = req.headers['content-length'];
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > max)) {
    req.resume();
    throw new StudioError(413, 'O pedido excedeu o tamanho permitido.', 'BODY_TOO_LARGE');
  }
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max) throw new StudioError(413, 'O pedido excedeu o tamanho permitido.', 'BODY_TOO_LARGE');
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof StudioError) throw error;
    throw new StudioError(400, 'O envio foi interrompido.', 'BODY_INTERRUPTED');
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('object');
    return body;
  } catch {
    throw new StudioError(400, 'Os dados JSON são inválidos.', 'INVALID_JSON');
  }
}

function assertOrigin(req, publicOrigin) {
  const origin = req.headers.origin;
  if (req.headers['sec-fetch-site'] === 'cross-site' ||
      (origin && origin !== new URL(publicOrigin).origin)) {
    throw new StudioError(403, 'Este endereço não pode alterar a aplicação.', 'ORIGIN_DENIED');
  }
}

function cookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

function issueCookie(res, name, secret, secure, maxAge) {
  const value = `${name}=${encodeURIComponent(secret)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAge))}${secure ? '; Secure' : ''}`;
  const existing = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(existing ? Array.isArray(existing) ? existing : [existing] : []), value]);
}

function digest(secret) {
  return createHash('sha256').update(String(secret)).digest('hex');
}
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}

module.exports = { StudioError, json, readJson, assertOrigin, cookie, issueCookie, digest, equal };
