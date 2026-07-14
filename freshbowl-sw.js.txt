// FRESHBOWL METHOD — Service Worker
// Cache-first for the app shell; network-updates cached for next load.
var CACHE = 'freshbowl-v1';

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return c.addAll(['./']);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k)   { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(function(cache) {
      return cache.match(e.request).then(function(cached) {
        var networkFetch = fetch(e.request).then(function(res) {
          if (res && res.status === 200) cache.put(e.request, res.clone());
          return res;
        }).catch(function() { return cached; });
        // Serve cache instantly; update in background
        return cached || networkFetch;
      });
    })
  );
});
