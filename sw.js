const CACHE_NAME = 'site-cache-2026-3-3';
const NUKE_VERSION = 'nuke-v1'; // ← bump this ONLY when you need to wipe users again
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
                console.log('💣 New nuke version detected — wiping IDB...');
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
        icon: data.icon || '/logo.png', 
        badge: data.badge || '/badge.png',
        vibrate: [100, 50, 100],
        // 🛑 CRITICAL FIXES START HERE
        sound: data.sound || '/sounds/notification.mp3', 
        tag: data.tag || 'new-dm',
        renotify: data.renotify || true,
        // 🛑 CRITICAL FIXES END HERE
        actions: data.actions || [{ action: 'open', title: 'Open Message' }],
        data: {
            // 🛑 THE FIX: Use the URL that the Edge Function already created
            // If it fails for some reason, fallback to just the ID
            url: data.data?.url || `/?open=chat&user=${senderId}`
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// --- CLICK HANDLER ---
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    // Get the relative URL from the notification data
    const path = event.notification.data.url;
    // Construct the full URL based on where the service worker is running
    const targetUrl = new URL(path, self.location.origin).href;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Try to find an existing tab and navigate it
            for (const client of windowClients) {
                if (new URL(client.url).origin === self.location.origin) {
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
