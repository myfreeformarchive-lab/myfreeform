// Minimal cache-first service worker — replace your current sw.js with this.
// Keeps your existing registration (navigator.serviceWorker.register('sw.js')) as-is.

const CACHE_NAME = 'site-cache-v1';

self.addEventListener('install', event => {
  // Activate new SW immediately
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Remove old caches and take control of clients
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME) ? caches.delete(k) : Promise.resolve()))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Only handle same-origin GET requests
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResp => {
      if (cachedResp) {
        // Return cached response immediately, update the cache in background
        event.waitUntil(
          fetch(event.request).then(networkResp => {
            if (networkResp && networkResp.ok) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResp.clone()));
            }
          }).catch(() => {})
        );
        return cachedResp;
      }

      // Not cached — fetch from network and cache the result for later
      return fetch(event.request).then(networkResp => {
        if (networkResp && networkResp.ok) {
          const copy = networkResp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return networkResp;
      }).catch(() => {
        // Network failed — return a minimal service-unavailable response
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});
