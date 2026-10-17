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
