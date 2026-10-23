import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api'
import { useStore } from '@/store'

export interface Resource<T> {
  data: T | undefined
  loading: boolean
  error: string | null
  reload: () => void
  /** Cambia los datos en pantalla al instante y devuelve cómo volver atrás. */
  mutate: (change: (data: T) => T) => () => void
}

/** GET de una colección; se vuelve a pedir cuando llega un evento cuyo tipo encaja con `refreshOn`. */
export function useResource<T>(path: string, refreshOn?: RegExp): Resource<T> {
  const [data, setData] = useState<T | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloads, setReloads] = useState(0)
  const trigger = useStore((s) => {
    // el servicio entrega los eventos en bloques: vale el último que interesa, no solo el último del bloque
    return refreshOn ? (s.events.findLast((e) => refreshOn.test(e.type))?.seq ?? 0) : 0
  })

  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      api<T>(path).then(
        (next) => { if (alive) { setData(next); setError(null); setLoading(false) } },
        (e: unknown) => { if (alive) { setError(e instanceof Error ? e.message : 'error'); setLoading(false) } },
      )
    }, trigger || reloads ? 100 : 0)
    return () => { alive = false; clearTimeout(timer) }
  }, [path, reloads, trigger])

  const reload = useCallback(() => setReloads((n) => n + 1), [])
  const mutate = useCallback((change: (d: T) => T) => {
    let before: T | undefined
    setData((d) => { before = d; return d === undefined ? d : change(d) })
    return () => setData(before)
  }, [])
  return { data, loading, error, reload, mutate }
}
