/* Cam Notlar Service Worker — sürüm ve önbellek listesi derlemede vite.config.ts tarafından doldurulur. */
const VERSION = '__VERSION__';
const CACHE = `camnotlar-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('camnotlar-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'skipWaiting') self.skipWaiting();
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // API ve başka kökenler asla önbelleğe alınmaz.
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/v1/')) return;
  if (req.mode === 'navigate') {
    // Uygulama kabuğu: ağ 3 sn içinde yanıt vermezse önbellekten açılır.
    e.respondWith((async () => {
      try {
        const res = await Promise.race([fetch(req), timeout(3000)]);
        if (res.ok) (await caches.open(CACHE)).put('/index.html', res.clone());
        return res;
      } catch {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }
  // Sürüm etiketli dosyalar: önce önbellek.
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && url.pathname.startsWith('/assets/')) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  })());
});
