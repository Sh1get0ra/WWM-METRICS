// killer SW 検証用 (test/sw-killer-verify、自動reload無し版): install即activate、activate時に全cache削除+自身unregister。
// silent-auto-reload-ux-flaw-2026-07-14 に従い、client.navigate()/location.reload() は呼ばない。
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
  })());
});
