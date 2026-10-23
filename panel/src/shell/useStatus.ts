import { useEffect, useState } from 'react'
import { api, type Status } from '@/api'
import { useStore } from '@/store'

/** Estado del servicio cada 3 s; `null` = sin respuesta (desconectado). El SSE de Producción lo sustituirá donde haga falta. */
export function useStatus(intervalMs = 3000): Status | null {
  const [status, setStatus] = useState<Status | null>(null)
  const directorSeq = useStore((s) => s.events.findLast((e) => e.type.startsWith('director.'))?.seq) // pausar/reanudar se ve al instante
  useEffect(() => {
    let alive = true
    const tick = () => api<Status>('/status').then((s) => alive && setStatus(s), () => alive && setStatus(null))
    void tick()
    const id = setInterval(tick, intervalMs)
    return () => { alive = false; clearInterval(id) }
  }, [intervalMs, directorSeq])
  return status
}
