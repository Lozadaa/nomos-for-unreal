import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { api } from './api'
import { connectEvents, type Live } from './sse'
import { animateUpdate } from '@/feel/transitions'
import type { KratosEvent, Task } from '@/lib/tasks'

export interface Snapshot {
  tasks: Task[]
  events: KratosEvent[]
  loaded: boolean
  live: boolean
  /** Intervalos en los que se perdió la conexión con el servicio (para la vista Actividad). */
  gaps: { from: string; to: string }[]
  /** Sube con cada evento del servicio; las vistas de detalle lo usan para volver a pedir sus datos. */
  version: number
}

const MAX_EVENTS = 500
let snap: Snapshot = { tasks: [], events: [], loaded: false, live: false, gaps: [], version: 0 }
let downSince: string | null = null
let everLive = false
const listeners = new Set<() => void>()
let connection: Live | null = null
let timer: ReturnType<typeof setTimeout> | undefined

const emit = () => listeners.forEach((l) => l())
const set = (next: Partial<Snapshot>) => { snap = { ...snap, ...next }; emit() }
const sameOrder = (a: Task[], b: Task[]) => a.length === b.length && a.every((t, i) => t.id === b[i].id && t.state === b[i].state)

export const getSnapshot = () => snap
export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const useStore = <T>(pick: (s: Snapshot) => T): T => useSyncExternalStore(subscribe, () => pick(snap))

/** Aplica un cambio de la lista; si cambia la estructura (altas, bajas, etapas) lo anima con View Transitions. */
function commitTasks(tasks: Task[]) {
  const apply = () => set({ tasks, loaded: true })
  if (!snap.loaded || sameOrder(snap.tasks, tasks)) apply()
  else void animateUpdate(() => flushSync(apply))
}

/** Pide la lista al servidor conservando las filas optimistas aún sin confirmar. */
export async function refresh(): Promise<void> {
  try {
    const fresh = await api<Task[]>('/tasks')
    const optimistic = snap.tasks.filter((t) => t.id.startsWith('tmp-'))
    commitTasks([...optimistic, ...fresh])
  } catch {
    set({ loaded: true })
  }
}

const schedule = () => {
  clearTimeout(timer)
  timer = setTimeout(() => void refresh(), 80) // agrupa las ráfagas (repetición inicial incluida) en una sola petición
}

/** Recibe un evento del servicio: lo guarda (hasta 500) y, si toca a las tareas, programa una lectura agrupada. */
export function ingest(e: KratosEvent): void {
  set({ events: [...snap.events.filter((x) => x.seq !== e.seq), e].slice(-MAX_EVENTS), version: snap.version + 1 })
  if (/^(task|decision|run)\./.test(e.type)) schedule()
}

export function startLive(): () => void {
  if (connection) return () => {}
  void refresh()
  connection = connectEvents(
    ingest,
    (live) => {
      if (live) {
        everLive = true
        if (downSince) set({ live, gaps: [...snap.gaps, { from: downSince, to: new Date().toISOString() }] })
        else set({ live })
        downSince = null
      } else {
        if (everLive && !downSince) downSince = new Date().toISOString()
        set({ live })
      }
    },
  )
  return () => { connection?.close(); connection = null; clearTimeout(timer) }
}

/** Añade una fila optimista y devuelve cómo quitarla. */
export function addOptimistic(task: Task): () => void {
  commitOptimistic([task, ...snap.tasks])
  return () => commitOptimistic(snap.tasks.filter((t) => t.id !== task.id))
}
const commitOptimistic = (tasks: Task[]) => void animateUpdate(() => flushSync(() => set({ tasks })))

/** Sustituye la fila optimista por la real; si el evento ya la había traído, solo quita la temporal. */
export function confirmOptimistic(tmpId: string, real: Task): void {
  const without = snap.tasks.filter((t) => t.id !== tmpId && t.id !== real.id)
  const index = snap.tasks.findIndex((t) => t.id === tmpId)
  const next = [...without]
  next.splice(index < 0 ? 0 : Math.min(index, next.length), 0, real)
  set({ tasks: next })
}

/** Cambia una tarea en sitio (acciones optimistas del detalle) y devuelve cómo deshacerlo. */
export function patchTask(id: string, patch: Partial<Task>): () => void {
  const before = snap.tasks.find((t) => t.id === id)
  set({ tasks: snap.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
  return () => { if (before) set({ tasks: snap.tasks.map((t) => (t.id === id ? before : t)) }) }
}

export function resetStore(): void {
  connection?.close(); connection = null; clearTimeout(timer)
  snap = { tasks: [], events: [], loaded: false, live: false, gaps: [], version: 0 }
  downSince = null
  everLive = false
  emit()
}
