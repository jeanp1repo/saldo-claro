// Saldo Claro · service worker: deja abrir la app sin internet con la última versión vista.
// Sube VERSION cada vez que cambies archivos de la app.
const VERSION = "saldo-claro-v3";
const ESTATICOS = ["./", "index.html", "styles.css", "manifest.webmanifest", "js/app.js", "js/data.js", "js/calc.js", "js/config.js", "js/ocr.js",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ESTATICOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Nunca cachear llamadas a Supabase, funciones ni CDNs de datos: siempre red.
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then((res) => {
      const copia = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copia)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});
