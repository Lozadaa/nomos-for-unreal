import { useEffect, useState } from 'react'
import { token } from '@/api'

/**
 * Los archivos del servicio piden el token en una cabecera y `<img>` o `<model-viewer>` no pueden enviarla, y la política de
 * seguridad del servicio no admite blob: ni data:. El service worker de /sw.js lee `?token=` y lo convierte en cabecera.
 */
export const authedUrl = (path: string) => `${path}?token=${encodeURIComponent(token ?? '')}`
export const artifactUrl = (id: string) => authedUrl(`/artifacts/${encodeURIComponent(id)}/file`)

function controlled(): Promise<void> {
  const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker
  if (!sw) return Promise.resolve()
  return sw.ready.then(() => new Promise<void>((resolve) => {
    if (sw.controller) return resolve()
    sw.addEventListener('controllerchange', () => resolve(), { once: true })
    setTimeout(resolve, 3000)
  }))
}

/** Dirección de un archivo del servicio (artefacto o miniatura del catálogo) cuando el service worker ya controla la página. */
export function useAuthedSrc(path: string | null): string | null {
  const [ready, setReady] = useState(typeof navigator === 'undefined' || !navigator.serviceWorker)
  useEffect(() => {
    if (ready) return
    let alive = true
    void controlled().then(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [ready])
  return ready && path ? authedUrl(path) : null
}

/** Antes de que el service worker controle la página, null: no se pide nada que vaya a dar 401. */
export const useArtifactSrc = (id: string) => useAuthedSrc(`/artifacts/${encodeURIComponent(id)}/file`)
