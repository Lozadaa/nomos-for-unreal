import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/** Un valor de filtro que vive en la URL (se puede compartir y recargar); sin historial extra. Devuelve la navegación para poder envolverla en una transición. */
export function useParam(key: string, fallback = ''): [string, (value: string) => void | Promise<void>] {
  const [params, setParams] = useSearchParams()
  const set = useCallback((value: string) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    if (!value || value === fallback) next.delete(key); else next.set(key, value)
    return next
  }, { replace: true, flushSync: true }), [fallback, key, setParams])
  return [params.get(key) ?? fallback, set]
}
