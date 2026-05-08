// Static cache version - bump this when shipping new builds
const CACHE_VERSION = 'rentals-v4';
const CACHE_NAME = CACHE_VERSION;

// Install: skip waiting, don't pre-cache anything (we'll cache on demand)
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate: claim clients and delete ALL old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // Delete every cache that doesn't match current version
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
      // Take control immediately
      await self.clients.claim();
    })()
  );
});

// Fetch: network-first for navigations and assets, fallback to cache only on network failure
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET requests; let everything else pass through
  if (req.method !== 'GET') return;

  // Skip cross-origin (Firebase, Google Fonts CDN, etc.) - let browser handle natively
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(response => {
        // Only cache successful basic responses
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(req))
  );
});
