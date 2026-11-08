// sw.js — the service worker of the installed app (PWA): Davos also starts without a network once it has been
// visited. Registered by play.html (the game) everywhere except on the development server (localhost / 127.0.0.1).
// - The site's own files: network first (a deploy is seen at once; the browser's HTTP cache still answers unchanged
//   files with 304s), the cached copy when offline. Every successful GET is kept, so whatever was streamed in on a
//   visit (terrain, imagery, buildings near the route) is there the next time.
// - three.js from jsDelivr is pinned to a commit and never changes: cache first.
const CACHE = 'slopdavos-v1';
const CDN = 'https://cdn.jsdelivr.net/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function keep(request, response) {
  if (response.ok && response.status === 200 && response.type !== 'opaque') {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.href.startsWith(CDN)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((r) => keep(request, r))));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // (the end of the login, its URL carries a one-time code: never kept)
  if (url.pathname.startsWith(new URL('auth/', self.registration.scope).pathname)) return;
  event.respondWith(fetch(request).then((r) => keep(request, r)).catch(async () => {
    const hit = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
    return hit || Response.error();
  }));
});
