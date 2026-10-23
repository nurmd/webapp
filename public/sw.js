/**
 * Vyapar Books PRO - Offline-First Service Worker
 * Provides resilient offline caching, app shell hydration, and instant updates.
 */

const CACHE_VERSION = 'vyapar-pwa-v1.3.1';

// CouchDB/PouchDB replication endpoints must never be cached. A stale
// _changes / _all_docs response can make a device believe it is caught up,
// and authenticated sync responses must not be persisted in Cache Storage.
const SYNC_ENDPOINT_MARKERS = [
  '/_changes',
  '/_all_docs',
  '/_bulk_docs',
  '/_bulk_get',
  '/_revs_diff',
  '/_local/',
  '/_find',
  '/_design/',
  '/_session'
];

function isSyncOrApiRequest(url) {
  return SYNC_ENDPOINT_MARKERS.some((marker) => url.pathname.includes(marker));
}

function isCacheableResponse(request, response) {
  return Boolean(
    response &&
    response.status === 200 &&
    !request.headers.has('Authorization')
  );
}
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './fonts/inter-latin.woff2',
  './fonts/plus-jakarta-sans-latin.woff2',
  './fonts/material-symbols-outlined.woff2'
];

// Install: Pre-cache core app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching asset warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up older cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_VERSION) {
            console.log('[SW] Purging outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy depending on request type
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const isFontAsset =
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com');

  // Skip non-GET requests and cross-origin analytics/APIs unless needed
  if (request.method !== 'GET') return;

  // Ignore chrome-extension requests
  if (url.protocol.startsWith('chrome-extension')) return;

  // Never intercept cross-origin CouchDB/PouchDB traffic. Let the browser
  // handle it directly so sync requests are not cached or replayed.
  if (url.origin !== self.location.origin && !isFontAsset) return;

  // Bypass same-origin sync/API endpoints as well (self-hosted CouchDB).
  if (isSyncOrApiRequest(url)) return;

  // 1. Navigation requests (SPA HTML page): Network-First, fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheableResponse(request, response)) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('./index.html');
          return fallback || caches.match('/index.html');
        })
    );
    return;
  }

  // 2. Static hashed assets (/assets/...) & fonts: Cache-First with background revalidation
  const isStaticAsset = url.pathname.includes('/assets/') || isFontAsset;

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Revalidate in background if not hashed
          return cachedResponse;
        }

        return fetch(request).then((networkResponse) => {
          if (isCacheableResponse(request, networkResponse)) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. All other requests: Network-First with Cache Fallback
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (isCacheableResponse(request, networkResponse)) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});

// Immediate activation message listener
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
