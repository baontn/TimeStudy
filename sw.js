// Offline cache. Change VERSION every time you update index.html or engine.js.
const VERSION = 'ts-v33';
const APP_FILES = ['./', './index.html', './engine.js', './analytics.js', './xlsx_export.js'];
const fresh = f => new Request(f, { cache: 'reload' });     // bypass the browser's HTTP cache so a new version is really stored
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(APP_FILES.map(fresh));
    for (const f of ['./data.js', './logo.png', './icon.png']) { try { await c.add(fresh(f)); } catch (_) {} }   // optional files
  }));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Network first (so a refresh shows the newest version when online), cached copy when offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
