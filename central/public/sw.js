// Service worker do app: guarda a "casca" (página, estilo, script e ícones) para abrir rápido e até sem internet.
// Os dados (/api) sempre vão à rede; sem rede, o app mostra o último painel que ficou guardado no celular.
const VERSAO = 'central-v1';
const CASCA = ['/', '/index.html', '/app.js', '/estilo.css', '/manifest.webmanifest', '/icone-192.png', '/icone-512.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSAO).then((cache) => cache.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(caches.keys()
    .then((chaves) => Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Casca: rede primeiro (pega a versão nova), cache se estiver sem internet.
  evento.respondWith(fetch(evento.request)
    .then((resposta) => {
      const copia = resposta.clone();
      caches.open(VERSAO).then((cache) => cache.put(evento.request, copia));
      return resposta;
    })
    .catch(() => caches.match(evento.request).then((r) => r || caches.match('/index.html'))));
});
