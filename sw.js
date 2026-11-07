// Offline cache. Change VERSION every time you update index.html or engine.js.
const VERSION = 'ts-v15';
const APP_FILES = ['./', './index.html', './engine.js', './analytics.js', './xlsx_export.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(APP_FILES);
    for (const f of ['./data.js', './logo.png']) { try { await c.add(f); } catch (_) {} }   // optional files
  }));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('/data.js')) {                  // data: newest copy first, cached copy when offline
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r;
    }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
