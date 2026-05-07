const CACHE_NAME = 'rentals-v3-' + new Date().getTime();
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png'
];

self.addEventListener('install', event => {
  // Force the new SW to become active immediately
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache).catch(() => {}))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      // Take control of all clients immediately
      self.clients.claim(),
      // Delete ALL old caches
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      )
    ])
  );
});

self.addEventListener('fetch', event => {
  // Network-first strategy: always try fresh network, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Update cache with fresh response
        if (response && response.status === 200 && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
