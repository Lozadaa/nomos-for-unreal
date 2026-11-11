import { createElement, useEffect, useState } from 'react'
import { useArtifactSrc } from '@/hooks/artifact'

/** Visor 3D. La biblioteca (~1 MB) se pide solo cuando hay un modelo que ver, para no cargarla en la primera visita. */
export function GlbViewer({ id, name }: { id: string; name: string }) {
  const src = useArtifactSrc(id)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    import('@google/model-viewer').then(() => alive && setReady(true), () => alive && setFailed(true))
    return () => { alive = false }
  }, [])
  if (failed) return <div className="grid h-full place-items-center text-sm text-muted-foreground">Couldn’t load the 3D viewer.</div>
  if (!ready || !src) return <div aria-hidden className="h-full" />
  return createElement('model-viewer', {
    src, alt: `3D model of ${name}`, role: 'img', 'aria-label': `3D model of ${name}`, 'camera-controls': '', 'shadow-intensity': '0',
    className: 'size-full bg-card', style: { '--poster-color': 'var(--card)' },
  })
}
