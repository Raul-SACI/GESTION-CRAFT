// Service worker mínimo para que la app sea instalable (PWA).
// No cachea nada: siempre va a la red, así la app siempre está actualizada.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Passthrough: deja pasar todas las peticiones a la red sin interceptar.
self.addEventListener('fetch', (event) => {
  // No hacemos event.respondWith → el navegador maneja la petición normalmente.
});
