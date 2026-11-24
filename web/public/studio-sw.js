'use strict';
// Service Worker do painel (escopo /studio): torna o app instalável e mostra um aviso claro sem internet.
// Não guarda dados do painel: tudo continua vindo da Central a cada abertura.
const OFFLINE = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<title>FBS Studio</title><body style="margin:0;min-height:100vh;display:grid;place-content:center;gap:12px;text-align:center;'
  + 'background:#11110f;color:#f5f4ed;font:16px system-ui,sans-serif;padding:24px"><strong style="font-size:20px">Sem conexão</strong>'
  + '<span style="color:#b4b2a7">O painel precisa de internet. As telas continuam tocando a programação.</span>'
  + '<button onclick="location.reload()" style="min-height:48px;border:0;border-radius:6px;background:#e7ad3c;color:#11110f;font-weight:700;font-size:16px">Tentar de novo</button></body></html>';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
