// Keep the receiver able to start and reconnect when its home-screen shortcut is
// opened before the event PC is reachable. Media and session data stay online.
const cacheName = 'fbs-live-shell-1.1.0';
const shell = new Set(['/', '/tv', '/live/client.js', '/live/control.js', '/live/live.css',
  '/display.js', '/display.css', '/logo-bs.png', '/live/icon-192.png', '/live/icon-512.png',
  '/control.webmanifest', '/tv.webmanifest']);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([...shell])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key =>
    key.startsWith('fbs-live-shell-') && key !== cacheName).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !shell.has(url.pathname) || url.search) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const cached = await (await caches.open(cacheName)).match(url.pathname);
    return cached || Response.error();
  }));
});
