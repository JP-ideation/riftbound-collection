/* Offline-Cache: App-Shell und Kartendaten. */
const V = 'rb-v1';
const SHELL = ['./', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/parser.js', 'js/deckbuilder.js', 'data/cards.json', 'icons/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Kartenbilder vom Riot-CDN: erst Cache, dann Netz (und dauerhaft ablegen)
  if (url.hostname.endsWith('rgpub.io')) {
    e.respondWith(caches.open(V + '-img').then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  // App selbst: Netz zuerst, Cache als Rückfall
  e.respondWith(fetch(e.request).then(r => {
    caches.open(V).then(c => c.put(e.request, r.clone())).catch(() => {});
    return r.clone();
  }).catch(() => caches.match(e.request).then(r => r ?? caches.match('index.html'))));
});
