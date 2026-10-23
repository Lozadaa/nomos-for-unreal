import { useCallback, useEffect, useRef, useState } from 'react'
import { humanError } from '@/lib/errors'
import { toasts, type ToastSpec } from './toasts'

export interface ActionOptions<T> {
  /** Aplica el cambio en pantalla al instante y devuelve cómo deshacerlo. */
  optimistic?: () => () => void
  /** Devuelve el toast de éxito; sin spec no hay toast (el resultado ya es visible). */
  success?: (result: T) => ToastSpec | void
  /** Toast propio para el error; por defecto «Reintentar» (o «Recargar decisión» ante un 409). */
  error?: (e: unknown) => ToastSpec
  /** Recarga la decisión cuando el servidor responde 409 (decisión caducada). */
  reload?: () => void
  minPendingMs?: number
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function useAction<T>(run: () => Promise<T>, opts: ActionOptions<T> = {}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const busy = useRef(false)
  const mounted = useRef(true)
  const latest = useRef({ run, opts })
  latest.current = { run, opts }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const fire = useCallback(async (): Promise<void> => {
    if (busy.current) return
    busy.current = true
    const { run, opts } = latest.current
    const focused = document.activeElement as HTMLElement | null
    const restoreFocus = () => {
      if (focused?.isConnected && document.activeElement !== focused) focused.focus()
    }
    const started = Date.now()
    setPending(true)
    setError(null)
    const revert = opts.optimistic?.()
    let failure: unknown
    let result: T | undefined
    let ok = false
    try { result = await run(); ok = true } catch (e) { failure = e }
    const rest = (opts.minPendingMs ?? 300) - (Date.now() - started)
    if (rest > 0) await sleep(rest)
    busy.current = false
    if (mounted.current) setPending(false)
    if (ok) {
      const spec = opts.success?.(result as T)
      if (spec) toasts.success(spec)
    } else {
      revert?.()
      const err = failure instanceof Error ? failure : new Error(String(failure))
      if (mounted.current) setError(err)
      const stale = (failure as { status?: number } | null)?.status === 409 && opts.reload
      toasts.error(opts.error?.(failure) ?? (stale
        ? {
            title: 'Esta decisión ya no está vigente',
            description: 'Cambió mientras la mirabas. Recárgala para ver el estado actual.',
            action: { label: 'Recargar decisión', onClick: () => { opts.reload!(); restoreFocus() } },
          }
        : {
            title: 'No se pudo completar la acción',
            description: humanError(err),
            action: { label: 'Reintentar', onClick: () => { void fire() } },
          }))
    }
    restoreFocus()
  }, [])

  return { pending, error, fire }
}
