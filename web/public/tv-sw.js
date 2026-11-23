/* Service Worker do receptor /tv: serve mídias completas e verificadas do Cache Storage, com suporte a Range.
 * Mídia ausente ou incompleta segue para a rede (streaming). Lê um bloco por vez: a RAM fica limitada a 8 MiB. */
'use strict';

var CACHE = 'fbs-media-v1';
var MEDIA = /^\/api\/v1\/media\/([0-9a-f-]{36})$/i;

function metaKey(id) { return '/__fbs-cache/' + id + '/meta'; }
function chunkKey(id, sha, index) { return '/__fbs-cache/' + id + '/' + sha + '/' + index; }

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin || url.searchParams.get('role') !== 'screen') return;
  var match = MEDIA.exec(url.pathname);
  if (!match || request.headers.get('x-fbs-prefetch')) return;
  event.respondWith(fromCache(match[1], request).then(function (response) {
    return response || fetch(request);
  }, function () {
    return fetch(request);
  }));
});

async function fromCache(id, request) {
  var cache = await caches.open(CACHE);
  var metaResponse = await cache.match(metaKey(id));
  if (!metaResponse) return null;
  var meta = await metaResponse.json();
  if (!meta.complete || !meta.size) return null;
  var size = meta.size;
  var start = 0;
  var end = size - 1;
  var status = 200;
  var range = request.headers.get('range');
  if (range) {
    var parsed = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!parsed || (parsed[1] === '' && parsed[2] === '')) return null;
    if (parsed[1] === '') start = Math.max(0, size - Number(parsed[2]));
    else {
      start = Number(parsed[1]);
      if (parsed[2] !== '') end = Math.min(size - 1, Number(parsed[2]));
    }
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    }
    status = 206;
  }
  var index = Math.floor(start / meta.chunkSize);
  var last = Math.floor(end / meta.chunkSize);
  var stream = new ReadableStream({
    pull: async function (controller) {
      if (index > last) { controller.close(); return; }
      var stored = await cache.match(chunkKey(id, meta.sha256, index));
      if (!stored) { controller.error(new Error('Bloco ausente no cache.')); return; }
      var blob = await stored.blob();
      var base = index * meta.chunkSize;
      var from = Math.max(start, base) - base;
      var to = Math.min(end + 1, base + blob.size) - base;
      controller.enqueue(new Uint8Array(await blob.slice(from, to).arrayBuffer()));
      index++;
    }
  });
  var headers = {
    'Content-Type': meta.mime, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store', 'X-FBS-Cache': 'hit'
  };
  if (status === 206) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
  return new Response(stream, { status: status, headers: headers });
}
