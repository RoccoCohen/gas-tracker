const CACHE = 'gas-tracker-v2';
const ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.json'];

// Cache app shell on install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Remove old caches on activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// App shell: cache-first. API calls (/entries): network-only — app.js handles the offline fallback.
self.addEventListener('fetch', event => {
  if (new URL(event.request.url).pathname.startsWith('/entries')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy));
        return response;
      });
    })
  );
});
