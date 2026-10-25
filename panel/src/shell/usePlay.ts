import { useEffect, useSyncExternalStore } from 'react'
import { api } from '@/api'
import { useAction } from '@/feel/useAction'
import { useNow } from '@/hooks/time'
import { useStore } from '@/store'

export interface PlayBuild {
  path: string; builtAt: string; size: number; check: string | null; testRunId: string | null
  task: { id: string; code: string | null; title: string } | null
  /** Hito 17: `build-info.json` del paquete; `stale` si no incluye la punta de main. */
  origin?: { commit: string; branch: string | null; builtAt: string; task: string | null; run: string | null } | null
  commit?: string; stale?: boolean
}
export interface PlayInfo {
  build: PlayBuild | null
  running: { pid: number; since: string } | null
  reason: string | null
  lastPlayedBuiltAt: string | null
}

// una sola copia para la cabecera y Producción
let info: PlayInfo | null = null
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export async function refreshPlay(): Promise<void> {
  try { info = await api<PlayInfo>('/play'); listeners.forEach((l) => l()) } catch { /* sin servicio: se queda lo último */ }
}

/** Eventos que pueden cambiar la última build o la partida. */
const relevant = (type: string) => type.startsWith('play.') || type.startsWith('test.') || type === 'artifact.created'

/** Estado de «Jugar»: GET /play al montar, con cada evento que lo cambie y cada 30 s (el director deja builds sin evento). */
export function usePlay() {
  const play = useSyncExternalStore(subscribe, () => info)
  const seq = useStore((s) => s.events.findLast((e) => relevant(e.type))?.seq ?? 0)
  useEffect(() => { void refreshPlay() }, [seq])
  useEffect(() => {
    const id = setInterval(() => void refreshPlay(), 30_000)
    return () => clearInterval(id)
  }, [])
  // «Arrancando…» mientras dura la acción: el POST vuelve tras play.started y el estado se relee antes de soltarlo
  const start = useAction(async () => { try { await api('/play', { method: 'POST', body: {} }) } finally { await refreshPlay() } }, { minPendingMs: 0 })
  const stop = useAction(async () => { try { await api('/play/stop', { method: 'POST', body: {} }) } finally { await refreshPlay() } }, { minPendingMs: 0 })
  // el contador de «Jugando» avanza cada segundo; el «hace 12 min» basta con 15 s
  const now = useNow(play?.running ? 1000 : 15000)
  return { play, now, starting: start.pending, onPlay: () => void start.fire(), onStop: () => void stop.fire() }
}
