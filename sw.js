const CACHE_NAME = 'site-cache-2026-3-1';

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

// --- PUSH NOTIFICATION HANDLER ---
self.addEventListener('push', (event) => {
    let data = { 
        title: 'New Message', 
        body: 'You have a new message.', 
        senderId: 'Someone',
        sound: '/sounds/notification.mp3' // Default fallback
    };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            console.error("Push event data was not JSON:", e);
        }
    }

    const senderId = data.senderId || 'Someone';

    const options = {
        body: data.body,
        icon: '/logo.png', 
        badge: '/badge.png', 
        vibrate: [100, 50, 100],
        // 🛑 CRITICAL FIXES START HERE
        sound: data.sound || '/sounds/notification.mp3', 
        tag: data.tag || 'new-dm',
        renotify: data.renotify || true,
        // 🛑 CRITICAL FIXES END HERE
        actions: data.actions || [{ action: 'open', title: 'Open Message' }],
        data: {
            url: `https://myfreeform.page/?open=chat&user=${senderId}`
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// --- CLICK HANDLER ---
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data.url;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Try to find an existing tab and navigate it
            for (const client of windowClients) {
                if (new URL(client.url).hostname === location.hostname) {
                    return client.navigate(targetUrl).then(c => c.focus());
                }
            }
            // If no tab is open, open a new one
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
