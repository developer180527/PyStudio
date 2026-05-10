const PYODIDE_VERSION = '0.27.2';
const SW_VERSION = `pystudio-v2-pyodide-${PYODIDE_VERSION}`;
const STATIC_CACHE = `${SW_VERSION}-static`;
const CDN_CACHE = `${SW_VERSION}-cdn`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
];

const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'fonts.gstatic.com', 'fonts.googleapis.com'];
const CDN_MAX_ENTRIES = 200;
const CDN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== CDN_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

function isCdnRequest(url) {
  return CDN_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith('.' + host));
}

function isCacheFresh(response) {
  const cachedAt = response.headers.get('x-pystudio-cached-at');
  if (!cachedAt) return true;
  const age = Date.now() - Number(cachedAt);
  return age < CDN_MAX_AGE_MS;
}

async function staleResponseWithTimestamp(response) {
  const headers = new Headers(response.headers);
  headers.set('x-pystudio-cached-at', String(Date.now()));
  const body = await response.clone().blob();
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).catch(() => cached))
    );
    return;
  }

  if (isCdnRequest(url)) {
    event.respondWith(
      caches.open(CDN_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached && isCacheFresh(cached)) return cached;
        try {
          const network = await fetch(req);
          if (network.ok) {
            const stamped = await staleResponseWithTimestamp(network.clone());
            cache.put(req, stamped);
            trimCache(CDN_CACHE, CDN_MAX_ENTRIES);
          }
          return network;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      })
    );
  }
});
