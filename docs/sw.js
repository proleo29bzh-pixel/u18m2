// Hors-ligne : l'appli s'ouvre même sans réseau (dernières données connues).
const CACHE = "u18m2-v72";
const SHELL = ["./", "index.html", "style.css?v=72", "app.js?v=72", "covoit.js?v=72", "entrainement.js?v=72", "coach.js?v=72", "annonces.js?v=72", "maillots.js?v=72", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord (données fraîches), cache en secours.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const key = url.pathname.endsWith("data.json") ? new Request(url.origin + url.pathname) : e.request;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
        return res;
      })
      .catch(() => caches.match(key))
  );
});
