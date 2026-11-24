/* Pré-carregamento do receptor /tv: baixa as mídias do plano em blocos de 8 MiB com Range,
 * verifica o SHA-256 de cada bloco (crypto.subtle), grava no Cache Storage e retoma do último bloco válido.
 * Requer contexto seguro (HTTPS ou localhost). Sem suporte, o receptor reproduz por streaming. */
(function () {
  'use strict';

  var CACHE = 'fbs-media-v1';
  var SPACE_MARGIN = 64 * 1024 * 1024;
  var supported = Boolean(window.isSecureContext && 'serviceWorker' in navigator && window.caches &&
    window.crypto && window.crypto.subtle && typeof ReadableStream === 'function');
  var stats = { supported: supported, ready: 0, total: 0, bytesReady: 0, bytesTotal: 0, downloading: null, errors: [] };
  var readyIds = {};
  var protectedIds = {};
  var wantedHash = null;
  var syncedHash = null;
  var running = false;
  var retryTimer = null;

  function metaKey(id) { return '/__fbs-cache/' + id + '/meta'; }
  function chunkKey(id, sha, index) { return '/__fbs-cache/' + id + '/' + sha + '/' + index; }
  function keyId(url) { var match = /\/__fbs-cache\/([^/]+)\//.exec(new URL(url, location.origin).pathname); return match ? match[1] : null; }

  function recordError(message) {
    stats.errors = [message].concat(stats.errors.filter(function (value) { return value !== message; })).slice(0, 5);
  }

  function hex(buffer) {
    var bytes = new Uint8Array(buffer);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return out;
  }

  async function readMeta(cache, id) {
    var response = await cache.match(metaKey(id));
    return response ? response.json() : null;
  }

  async function ensureSpace(cache, file, missingBytes) {
    if (!navigator.storage || !navigator.storage.estimate) return true;
    var estimate = await navigator.storage.estimate();
    if (!estimate.quota) return true;
    if (estimate.quota - (estimate.usage || 0) >= missingBytes + SPACE_MARGIN) return true;
    recordError('Espaço insuficiente para ' + file.name + '.');
    return false;
  }

  async function syncFile(cache, file) {
    if (!file.sha256 || !file.chunks || !file.chunkSize) return false; // integridade ainda em cálculo no servidor
    var meta = await readMeta(cache, file.id);
    if (meta && meta.complete && meta.sha256 === file.sha256) return true;
    var missing = [];
    var missingBytes = 0;
    for (var index = 0; index < file.chunks.length; index++) {
      if (!(await cache.match(chunkKey(file.id, file.sha256, index)))) {
        missing.push(index);
        missingBytes += Math.min(file.chunkSize, file.size - index * file.chunkSize);
      }
    }
    stats.bytesReady += file.size - missingBytes;
    if (missing.length && !(await ensureSpace(cache, file, missingBytes))) return false;
    for (var k = 0; k < missing.length; k++) {
      var n = missing[k];
      var start = n * file.chunkSize;
      var end = Math.min(file.size, start + file.chunkSize) - 1;
      stats.downloading = file.id;
      var response = await fetch(file.url, {
        headers: { Range: 'bytes=' + start + '-' + end, 'X-FBS-Prefetch': '1' }, credentials: 'same-origin', cache: 'no-store'
      });
      if (response.status !== 206 && !(response.status === 200 && file.chunks.length === 1)) {
        throw new Error('HTTP ' + response.status + ' ao baixar ' + file.name + '.');
      }
      var buffer = await response.arrayBuffer();
      if (buffer.byteLength !== end - start + 1) throw new Error('Bloco ' + n + ' de ' + file.name + ' incompleto.');
      if (hex(await crypto.subtle.digest('SHA-256', buffer)) !== file.chunks[n]) {
        throw new Error('Bloco ' + n + ' de ' + file.name + ' não confere (SHA-256).');
      }
      await cache.put(chunkKey(file.id, file.sha256, n), new Response(buffer, { headers: { 'Content-Type': 'application/octet-stream' } }));
      stats.bytesReady += buffer.byteLength;
    }
    await cache.put(metaKey(file.id), new Response(JSON.stringify({
      id: file.id, sha256: file.sha256, size: file.size, mime: file.mime, chunkSize: file.chunkSize,
      count: file.chunks.length, complete: true
    }), { headers: { 'Content-Type': 'application/json' } }));
    return true;
  }

  // Remove o que não está no plano nem em uso. Nunca remove a mídia no ar.
  async function cleanup(cache, files) {
    var keep = {};
    files.forEach(function (file) { keep[file.id] = file.sha256; });
    var keys = await cache.keys();
    for (var i = 0; i < keys.length; i++) {
      var id = keyId(keys[i].url);
      if (!id || protectedIds[id]) continue;
      var path = new URL(keys[i].url).pathname;
      var stale = !Object.prototype.hasOwnProperty.call(keep, id) ||
        (!/\/meta$/.test(path) && keep[id] && path.indexOf('/' + keep[id] + '/') === -1);
      if (stale) await cache.delete(keys[i]);
    }
  }

  async function run() {
    if (running || !supported || !wantedHash || wantedHash === syncedHash) return;
    running = true;
    var target = wantedHash;
    try {
      var response = await fetch('/api/v1/screens/self/manifest', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Manifesto indisponível (HTTP ' + response.status + ').');
      var manifest = await response.json();
      var files = manifest.files || [];
      var cache = await caches.open(CACHE);
      await cleanup(cache, files);
      stats.total = files.length;
      stats.bytesTotal = files.reduce(function (sum, file) { return sum + file.size; }, 0);
      stats.bytesReady = 0;
      stats.ready = 0;
      var ready = {};
      var failed = false;
      for (var i = 0; i < files.length; i++) {
        try {
          if (await syncFile(cache, files[i])) { ready[files[i].id] = true; stats.ready++; }
          else failed = true;
        } catch (error) {
          failed = true;
          recordError(error.message);
        }
        readyIds = Object.assign({}, readyIds, ready);
      }
      readyIds = ready;
      stats.downloading = null;
      if (!failed) { syncedHash = target; stats.errors = []; }
    } catch (error) {
      recordError(error.message);
    } finally {
      running = false;
      stats.downloading = null;
      clearTimeout(retryTimer);
      if (wantedHash !== syncedHash) retryTimer = setTimeout(run, wantedHash === target ? 15000 : 0);
    }
  }

  if (supported) {
    navigator.serviceWorker.register('/tv-sw.js').catch(function (error) {
      supported = false;
      stats.supported = false;
      recordError('Service Worker indisponível: ' + error.message);
    });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  }

  window.FBSCache = {
    get supported() { return supported; },
    update: function (planHash) {
      if (!supported || !planHash || planHash === wantedHash) return;
      wantedHash = planHash;
      run();
    },
    protect: function (mediaId) { protectedIds = {}; if (mediaId) protectedIds[mediaId] = true; },
    isReady: function (mediaId) { return Boolean(readyIds[mediaId]); },
    stats: function () { return JSON.parse(JSON.stringify(stats)); },
    storage: function () {
      return navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve({});
    },
    clear: function () {
      readyIds = {};
      wantedHash = syncedHash = null;
      return window.caches ? caches.delete(CACHE) : Promise.resolve();
    }
  };
})();
