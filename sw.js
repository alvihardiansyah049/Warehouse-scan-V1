// Service Worker — untuk PWA offline support
const CACHE_NAME = "scan-resi-v1";
const ASSETS = [
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
];

// Install: simpan file ke cache
self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: hapus cache lama
self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: pakai cache dulu, kalau tidak ada baru ke network
self.addEventListener("fetch", function(e) {
  // Jangan cache request ke Apps Script (harus selalu online)
  if (e.request.url.includes("script.google.com")) return;

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request);
    })
  );
});
