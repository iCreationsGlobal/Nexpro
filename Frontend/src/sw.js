/**
 * ABS Service Worker (injectManifest)
 * Precaches app shell for installability and faster repeat visits.
 */
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Page loads (opening the installed app, links into any page, refresh): fetch index.html from the
// network as before, but when offline or the network is very slow, serve the precached app shell
// so the app still opens and shows its saved data.
const PAGE_LOAD_TIMEOUT_MS = 4000;

const fetchWithTimeout = (request, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Page load timed out')), timeoutMs);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

registerRoute(
  new NavigationRoute(
    async ({ request }) => {
      try {
        return await fetchWithTimeout(request, PAGE_LOAD_TIMEOUT_MS);
      } catch {
        return (await matchPrecache('/index.html')) || Response.error();
      }
    },
    { denylist: [/^\/api\//, /^\/socket\.io\//] }
  )
);

// JS/CSS chunks: prefer network so deploys don't serve stale hashed assets from precache.
registerRoute(
  ({ request, url }) =>
    request.destination === 'script' ||
    request.destination === 'style' ||
    (url.pathname.startsWith('/assets/') && /\.(js|css)$/i.test(url.pathname)),
  new NetworkFirst({
    cacheName: 'runtime-assets',
    networkTimeoutSeconds: 5,
    plugins: [
      {
        handlerDidError: async () => {
          const clients = await self.clients.matchAll({ type: 'window' });
          clients.forEach((client) => {
            client.postMessage({ type: 'CHUNK_LOAD_FAILED' });
          });
        },
      },
    ],
  })
);

self.addEventListener('install', () => {
  // PWAUpdatePrompt posts SKIP_WAITING when a waiting worker is ready
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Web push (sent by the backend next to the mobile app's pushes). Payload: { title, body, url, tag }.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || '' };
  }
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/dashboard';
  event.waitUntil(
    self.registration.showNotification(payload.title || 'ABS', {
      body: payload.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      tag: payload.tag || undefined,
      renotify: Boolean(payload.tag),
      data: { url },
    })
  );
});

// Tapping a notification: bring ABS forward on the right page (or open it).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.url;
  const url = typeof path === 'string' && path.startsWith('/') ? path : '/dashboard';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        open.postMessage({ type: 'NAVIGATE', url });
        return open.focus();
      }
      return self.clients.openWindow(url);
    })()
  );
});
