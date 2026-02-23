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
        vibrate: [200, 100, 200],
        // --- ADD THESE THREE LINES ---
        sound: data.sound || '/sounds/notification.mp3', 
        actions: data.actions || [], 
        tag: data.tag || 'new-dm',
        // ------------------------------
        renotify: true,
        data: {
            // Check both locations for the URL
            url: data.data?.url || data.url || '/?open=chat' 
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// --- NOTIFICATION CLICK HANDLER ---
self.addEventListener('notificationclick', (event) => {
    // 1. Close the notification immediately
    event.notification.close();

    // 2. Extract the URL we sent from the Edge Function
    // We look in event.notification.data.url because that's where we put it
    const targetUrl = event.notification.data?.url || '/?open=chat';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // 3. Check if your site is already open in any tab
            for (const client of windowClients) {
                const clientUrl = new URL(client.url);
                // Matches if it's your domain
                if (clientUrl.hostname === location.hostname) {
                    // Update the existing tab to the chat URL and bring it to the front
                    return client.navigate(targetUrl).then(c => c.focus());
                }
            }

            // 4. If the site isn't open at all, open a new tab with the target URL
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
