const CACHE_NAME = 'site-cache-2026-3-4';
const NUKE_VERSION = 'nuke-v2'; // ← bump this ONLY when you need to wipe users again
const NUKE_FLAG_KEY = 'nuke-applied';

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(k => (k !== CACHE_NAME) ? caches.delete(k) : Promise.resolve()))
        ).then(async () => {
            // Check if this nuke has already been applied
            const cache = await caches.open('nuke-flags');
            const already = await cache.match(NUKE_FLAG_KEY);
            const appliedVersion = already ? await already.text() : null;

            if (appliedVersion !== NUKE_VERSION) {
                console.log('💣 New nuke version detected (${NUKE_VERSION}) — wiping IDB...');
                const clients = await self.clients.matchAll({ includeUncontrolled: true });
                clients.forEach(c => c.postMessage({ type: 'NUKE_IDB' }));
                // Store the flag so it never runs again
                await cache.put(NUKE_FLAG_KEY, new Response(NUKE_VERSION));
            } else {
                console.log('✅ Nuke already applied — skipping');
            }
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) {
        return;
    }
	
	// ✅ Never cache favicons — the page manages these dynamically via canvas
    const path = new URL(event.request.url).pathname;
    if (
        path.includes('favicon') ||
        path.match(/icon.*\.(png|svg|ico)$/i) ||
        path.includes('apple-touch-icon')
    ) {
        event.respondWith(fetch(event.request).catch(() => new Response('', { status: 404 })));
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
        title: 'New Notification', 
        body: 'You have a new notification.'
    };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            console.error("Push event data was not JSON:", e);
        }
    }

  const options = {
    body: data.body, 
    icon: data.icon || 'https://myfreeform.page/icon_2-512.png',
    badge: data.badge || 'https://myfreeform.page/badge-96.png',
    vibrate: [100, 50, 100],
    tag: data.tag || 'new-notification',
    renotify: data.renotify || true,
    actions: data.actions || [],
    color: data.color || '#9D60FF',
    data: {
        url: data.data?.url || null
    }
};

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// --- CLICK HANDLER ---
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const path = event.notification.data?.url;

    // If no URL (likes/comments have none for now), just focus the app
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            if (!path) {
                // Just focus existing tab if open
                for (const client of windowClients) {
                    if (new URL(client.url).origin === self.location.origin) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) return clients.openWindow('/');
                return;
            }

            // Message notification — navigate to chat
            const targetUrl = new URL(path, self.location.origin).href;
            for (const client of windowClients) {
                if (new URL(client.url).origin === self.location.origin) {
                    return client.navigate(targetUrl).then(c => c.focus());
                }
            }
            if (clients.openWindow) return clients.openWindow(targetUrl);
        })
    );
});
