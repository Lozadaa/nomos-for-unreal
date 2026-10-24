import { useCallback, useEffect, useRef, useState } from 'react'
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

  // Límite de frecuencia, no rebote (hito 10): con datos reales la reproducción del SSE trae eventos sin pausa y un
  // rebote aplazaba la petición mientras durase, dejando Presupuesto o Entregas en esqueletos.
  const current = useRef(path)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  current.current = path
  useEffect(() => () => { clearTimeout(timer.current); timer.current = undefined; current.current = '' }, [])
  useEffect(() => {
    if (timer.current) return
    timer.current = setTimeout(() => {
      timer.current = undefined
      const asked = current.current
      if (!asked) return
      api<T>(asked).then(
        (next) => { if (current.current === asked) { setData(next); setError(null); setLoading(false) } },
        (e: unknown) => { if (current.current === asked) { setError(e instanceof Error ? e.message : 'error'); setLoading(false) } },
      )
    }, trigger || reloads ? 100 : 0)
  }, [path, reloads, trigger])

  const reload = useCallback(() => setReloads((n) => n + 1), [])
  const mutate = useCallback((change: (d: T) => T) => {
    let before: T | undefined
    setData((d) => { before = d; return d === undefined ? d : change(d) })
    return () => setData(before)
  }, [])
  return { data, loading, error, reload, mutate }
}
