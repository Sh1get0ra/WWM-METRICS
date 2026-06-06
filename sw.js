// WWM-METRICS Service Worker
const CACHE_NAME = 'wwm-metrics-v9';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/styles-tokens.css',
  './assets/styles-animations.css',
  './assets/styles-base.css',
  './assets/styles-components.css',
  './assets/styles-modals.css',
  './assets/styles-responsive.css',
  './assets/styles-dark.css',
  './assets/styles-light.css',
  './assets/styles-obs.css',
  './assets/calc.js',
  './assets/stats.js',
  './assets/sidebar.js',
  './assets/import.js',
  './assets/app.js',
  './assets/i18n.js',
  './assets/icons/pwa-icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // クロスオリジン (外部 API) は scope外、bypass
  if (url.origin !== self.location.origin) return;
  // network-first for HTML/JSON (新しいデータ優先)
  if (req.destination === 'document' || url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }
  // cache-first for static assets
  event.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => cached)
    )
  );
});
