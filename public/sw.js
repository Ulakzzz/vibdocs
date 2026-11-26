// Service worker do VibDocs: deixa o site instalável e abre mesmo sem internet (as telas; os dados vêm do
// SharePoint sincronizado e do navegador). Página: rede primeiro; arquivos do site: cache primeiro.
const CACHE = 'vibdocs-v1'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icone-192.png'])))
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  // dados de outros sites do mesmo endereço (ex.: histórico preditivo) não entram no cache
  if (!url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          caches.open(CACHE).then((c) => c.put('./index.html', r.clone()))
          return r
        })
        .catch(() => caches.match('./index.html')),
    )
    return
  }
  e.respondWith(
    caches.match(e.request).then(
      (achado) =>
        achado ||
        fetch(e.request).then((r) => {
          if (r.ok && /\/assets\//.test(url.pathname)) caches.open(CACHE).then((c) => c.put(e.request, r.clone()))
          return r
        }),
    ),
  )
})
