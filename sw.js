/* Service worker: deja la web (y el visor de PDF) disponible sin conexión.
   - La web y los JSON van "primero red": si hay conexión se ve siempre lo último publicado; si no hay
     (o tarda más de 4 s), se sirve la copia guardada.
   - Los PDF guardados en «Mi kneeboard» viven en otra caché (kneeboard-pdf) que gestiona la página, no este archivo;
     aquí solo se usan como respaldo cuando un PDF se pide sin conexión.
   Al cambiar algún archivo de la lista PRECACHE, sube VERSION para que los móviles y tablets lo renueven. */
const VERSION = "v3";
const SHELL = "shell-" + VERSION;
const PDFS = "kneeboard-pdf";
const PRECACHE = [
  "./", "index.html", "kneeboard.js", "kneeboard.css", "ayuda.js", "ayuda.css", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png",
  "data/taxonomia.json", "data/documentos.json", "data/creditos.json", "data/modulos.json",
  "data/mapas.json", "data/misiones.json", "data/portada.json",
  "vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith("shell-") && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;

  /* PDF y demás archivos de docs/: la red manda; sin red, la copia de Mi kneeboard si existe */
  if (url.pathname.includes("/docs/")) {
    e.respondWith(fetch(req).catch(() => caches.open(PDFS).then(c => c.match(req.url)).then(r => r || Response.error())));
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const red = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; });
    const lento = new Promise(ok => setTimeout(ok, 4000, null));
    const res = await Promise.race([red.catch(() => null), lento]);
    if (res) return res;
    const copia = await cache.match(req, {ignoreSearch: true}) ||
      (req.mode === "navigate" ? await cache.match("index.html") : null);
    return copia || red;
  })());
});
