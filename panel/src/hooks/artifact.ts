import { useEffect, useState } from 'react'
import { token } from '@/api'

/**
 * Los archivos del servicio piden el token en una cabecera y `<img>` o `<model-viewer>` no pueden enviarla, y la política de
 * seguridad del servicio no admite blob: ni data:. El service worker de /sw.js lee `?token=` y lo convierte en cabecera.
 */
export const artifactUrl = (id: string) => `/artifacts/${encodeURIComponent(id)}/file?token=${encodeURIComponent(token ?? '')}`

function controlled(): Promise<void> {
  const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker
  if (!sw) return Promise.resolve()
  return sw.ready.then(() => new Promise<void>((resolve) => {
    if (sw.controller) return resolve()
    sw.addEventListener('controllerchange', () => resolve(), { once: true })
    setTimeout(resolve, 3000)
  }))
}

/** Dirección del archivo cuando el service worker ya controla la página (antes, null: no se pide nada que vaya a dar 401). */
export function useArtifactSrc(id: string): string | null {
  const [ready, setReady] = useState(typeof navigator === 'undefined' || !navigator.serviceWorker)
  useEffect(() => {
    if (ready) return
    let alive = true
    void controlled().then(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [ready])
  return ready ? artifactUrl(id) : null
}
