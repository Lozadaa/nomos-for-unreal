import { useEffect, useState } from 'react'
import { api, type Status } from '@/api'

/** Estado del servicio cada 3 s; `null` = sin respuesta (desconectado). El SSE de Producción lo sustituirá donde haga falta. */
export function useStatus(intervalMs = 3000): Status | null {
  const [status, setStatus] = useState<Status | null>(null)
  useEffect(() => {
    let alive = true
    const tick = () => api<Status>('/status').then((s) => alive && setStatus(s), () => alive && setStatus(null))
    void tick()
    const id = setInterval(tick, intervalMs)
    return () => { alive = false; clearInterval(id) }
  }, [intervalMs])
  return status
}
