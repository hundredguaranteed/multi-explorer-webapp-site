const CACHE_VERSION = "20260421-layout-v76";
const DATA_CACHE_VERSION = "20260421-layout-v76";
const APP_CACHE = `multi-explorer-app-${CACHE_VERSION}`;
const DATA_CACHE = `multi-explorer-data-${DATA_CACHE_VERSION}`;
const KNOWN_CACHES = new Set([APP_CACHE, DATA_CACHE]);

const APP_ASSETS = [
  "./",
  "./index.html",
  "./app.js?v=20260421-layout-v76",
  "./styles.css?v=20260421-layout-v76",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_ASSETS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => (KNOWN_CACHES.has(key) ? undefined : caches.delete(key)))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (isDataAsset(url)) {
    event.respondWith(cacheFirstDataAsset(request, DATA_CACHE));
    return;
  }

  if (isAppAsset(url, request)) {
    event.respondWith(staleWhileRevalidate(request, APP_CACHE));
  }
});

function isDataAsset(url) {
  return /\/data\/vendor\/.+\.js$/i.test(url.pathname) || /\/data\/.+\.js$/i.test(url.pathname);
}

function isAppAsset(url, request) {
  if (request.mode === "navigate") return true;
  return /\/(?:index\.html|app\.js|styles\.css)$/i.test(url.pathname);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  cacheResponse(cache, request, response);
  return response;
}

async function cacheFirstDataAsset(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cacheKey = getDataCacheKey(request);
  const cached = await cache.match(cacheKey) || await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  cacheResponse(cache, cacheKey, response);
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      cacheResponse(cache, request, response);
      return response;
    })
    .catch(() => cached);
  return cached || refresh;
}

function cacheResponse(cache, request, response) {
  if (!response || !response.ok) return;
  if (response.type !== "basic" && response.type !== "cors") return;
  cache.put(request, response.clone()).catch(() => undefined);
}

function getDataCacheKey(request) {
  const url = new URL(request.url);
  url.search = "";
  return url.href;
}
