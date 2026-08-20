const CACHE_VERSION = 'amaalbooks-shell-v1';
const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icons/amaalbooks-192.png',
  '/icons/amaalbooks-512.png',
  '/icons/amaalbooks-maskable-512.png',
  '/icons/amaalbooks-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && url.pathname === '/') caches.open(CACHE_VERSION).then((cache) => cache.put('/', response.clone()));
      return response;
    }).catch(async () => (await caches.match('/')) || Response.error()));
    return;
  }

  const isStaticAsset = /\.(?:js|css|woff2?|ttf|png|jpg|jpeg|svg|ico)$/i.test(url.pathname);
  if (isStaticAsset) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
      return response;
    })));
  }
});
