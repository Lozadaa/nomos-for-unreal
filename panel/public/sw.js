// Convierte ?token= de las peticiones a /artifacts/*, /approvals/* (imágenes; hito 28), /catalog/*/thumbnail, /tasks/*/archive/* /projects/*/capture y /capture en la cabecera Authorization (ver src/hooks/artifact.ts).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || !(url.pathname.startsWith('/artifacts/') || url.pathname.startsWith('/approvals/') || /^\/catalog\/[^/]+\/thumbnail$/.test(url.pathname) || /^\/tasks\/[^/]+\/archive\/./.test(url.pathname) || /^\/projects\/\d+\/capture$/.test(url.pathname) || url.pathname === '/capture')) return
  const token = url.searchParams.get('token')
  if (!token) return
  url.searchParams.delete('token')
  event.respondWith(fetch(url.pathname + url.search, { headers: { Authorization: 'Bearer ' + token } }))
})
