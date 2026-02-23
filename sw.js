const CACHE_NAME = 'site-cache-v1';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME) ? caches.delete(k) : Promise.resolve()))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cachedResp => {
      if (cachedResp) {
        event.waitUntil(
          fetch(event.request).then(networkResp => {
            if (networkResp && networkResp.ok) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResp.clone()));
            }
          }).catch(() => {})
        );
        return cachedResp;
      }
      return fetch(event.request).then(networkResp => {
        if (networkResp && networkResp.ok) {
          const copy = networkResp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return networkResp;
      }).catch(() => {
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});

// --- PUSH NOTIFICATION LISTENER ---
self.addEventListener('push', (event) => {
    let data = { title: 'New Message', body: 'You have a new message.', url: '/?open=chat' };
    
    try {
        if (event.data) {
            data = event.data.json();
        }
    } catch (e) {
        console.warn("Push event data was not JSON");
    }

    const options = {
        body: data.body,
        icon: '/logo.png', 
        badge: '/badge.png', 
        vibrate: [100, 50, 100],
        data: {
            // Ensure we fallback to the chat parameter if the Edge Function misses it
            url: data.url || '/?open=chat' 
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// --- NOTIFICATION CLICK HANDLER ---
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // Use the URL passed from the notification data
    const targetUrl = event.notification.data?.url || '/?open=chat';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Check if a tab is already open
            for (const client of windowClients) {
                const clientUrl = new URL(client.url);
                if (clientUrl.hostname === location.hostname) {
                    // Navigate the existing tab to the chat URL and focus it
                    return client.navigate(targetUrl).then(c => c.focus());
                }
            }
            // If no tab is open, open a new one with the chat parameter
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
