/**
 * Offline-Betrieb.
 *
 * App-Dateien: immer zuerst aus dem Netz mit Revalidierung, Cache nur als
 * Rueckfall. So zieht ein neuer Deploy sofort, statt eine alte Version
 * festzuhalten. Kartenbilder vom Riot-CDN: Cache zuerst, die aendern sich nicht.
 */
const V = 'rb-shell-v3';
const IMG = 'rb-img-v1';
const SHELL = ['./', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/parser.js', 'js/deckbuilder.js', 'js/guide.js',
  'data/cards.json', 'icons/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V && k !== IMG) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if (url.hostname.endsWith('rgpub.io')) {
    e.respondWith((async () => {
      const c = await caches.open(IMG);
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    try {
      const res = await fetch(e.request, { cache: 'no-cache' });
      if (res.ok) (await caches.open(V)).put(e.request, res.clone());
      return res;
    } catch {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      // Nur echte Seitenaufrufe duerfen auf die App-Huelle zurueckfallen.
      // Fuer ein fehlendes Skript oder JSON waere das ein stilles HTML-in-JS
      // und die App braeche unverstaendlich ab.
      if (e.request.mode === 'navigate') {
        const shell = await caches.match('index.html');
        if (shell) return shell;
      }
      return new Response('Offline und nicht im Cache', { status: 504, statusText: 'Offline' });
    }
  })());
});
