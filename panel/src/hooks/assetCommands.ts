import { useEffect, useRef } from 'react'
import { api } from '@/api'
import { toasts } from '@/feel/toasts'
import { useAction } from '@/feel/useAction'
import { useStore } from '@/store'

/** Encola una orden en la bandeja del servicio (POST /commands); el trabajo ocurre en el ejecutor, no en la petición. */
export const sendCommand = (type: string, payload: Record<string, unknown>, idempotencyKey: string) =>
  api<{ commandId: string }>('/commands', { method: 'POST', body: { type, payload, idempotencyKey } })

/** Una indexación por minuto: dos clics seguidos reutilizan la misma orden. */
export const minuteKey = (type: string, now = new Date()) => `${type}:${now.toISOString().slice(0, 16)}`

export function useIndexCatalog() {
  return useAction(() => sendCommand('asset.index', {}, minuteKey('asset.index')), {
    success: () => ({ title: 'Indexando el catálogo', description: 'Te aviso con el recuento al terminar.' }),
  })
}

/** Toast con el recuento cuando llega un `catalog.indexed` nuevo (no los del historial que ya estaban al abrir el panel). */
export function useCatalogIndexedToast() {
  const last = useStore((s) => s.events.findLast((e) => e.type === 'catalog.indexed'))
  const opened = useRef(Date.now())
  const seen = useRef<number | null>(null)
  useEffect(() => {
    if (!last || last.seq === seen.current || Date.parse(last.createdAt) < opened.current - 5000) return
    seen.current = last.seq
    const entries = Number(last.payload.entries ?? 0)
    toasts.success({ title: 'Catálogo indexado', description: `${entries} ${entries === 1 ? 'asset' : 'assets'} en el catálogo` })
  }, [last])
}
