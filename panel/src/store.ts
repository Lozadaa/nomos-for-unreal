import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { api } from './api'
import { connectEvents, type Live } from './sse'
import { animateUpdate } from '@/feel/transitions'
import { isTemp, type KratosEvent, type Task } from '@/lib/tasks'

export interface Snapshot {
  tasks: Task[]
  events: KratosEvent[]
  loaded: boolean
  live: boolean
  /** Intervalos en los que se perdió la conexión con el servicio (para la vista Actividad). */
  gaps: { from: string; to: string }[]
  /** Sube con cada evento del servicio; las vistas de detalle lo usan para volver a pedir sus datos. */
  version: number
  /** Tareas cuyo worker espera respuesta, con la pregunta; se reduce de `worker.*` y `run.finished`. */
  waiting: Record<string, { runId: string; question: string }>
}

const MAX_EVENTS = 500
let snap: Snapshot = { tasks: [], events: [], loaded: false, live: false, gaps: [], version: 0, waiting: {} }
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

/**
 * Toda mutación de la lista pasa por una cola en serie y se evalúa en el momento de aplicarse, no en el de pedirse:
 * con View Transitions el callback llega un frame después (o tras otra transición) y una lista calculada antes pisaría
 * lo ocurrido entretanto (p. ej. la respuesta del POST que confirma una fila optimista).
 */
let queue: Promise<void> = Promise.resolve()
let epoch = 0
function mutate(change: (tasks: Task[]) => Task[]): Promise<void> {
  const mine = epoch
  const run = async () => {
    if (mine !== epoch) return
    const apply = () => { if (mine === epoch) set({ tasks: change(snap.tasks), loaded: true }) }
    const structural = snap.loaded && !sameOrder(snap.tasks, change(snap.tasks))
    if (structural) await animateUpdate(() => flushSync(apply))
    else apply()
  }
  queue = queue.then(run, run)
  return queue
}

/** Pide la lista al servidor conservando las filas optimistas aún sin confirmar. */
export async function refresh(): Promise<void> {
  try {
    const fresh = await api<Task[]>('/tasks')
    await mutate((current) => [...current.filter((t) => isTemp(t.id)), ...fresh])
  } catch {
    set({ loaded: true })
  }
}

const schedule = () => {
  clearTimeout(timer)
  timer = setTimeout(() => void refresh(), 80) // agrupa las ráfagas (repetición inicial incluida) en una sola petición
}

/** Mantiene `waiting`: la pregunta del worker la abre y cualquier señal de que siguió (salida, mensaje, fin) la cierra. */
function reduceWaiting(waiting: Snapshot['waiting'], e: KratosEvent): Snapshot['waiting'] {
  const taskId = String(e.payload.taskId ?? '')
  if (!taskId) return waiting
  if (e.type === 'worker.waiting') return { ...waiting, [taskId]: { runId: String(e.payload.runId), question: String(e.payload.question ?? '') } }
  if (!(taskId in waiting) || !/^(worker\.(output|message_sent)|run\.finished)$/.test(e.type)) return waiting
  const { [taskId]: _, ...rest } = waiting
  return rest
}

/** Recibe un evento del servicio: lo guarda (hasta 500) y, si toca a las tareas, programa una lectura agrupada. */
export function ingest(e: KratosEvent): void {
  const fresh = !snap.events.some((x) => x.seq === e.seq)
  set({ events: [...snap.events.filter((x) => x.seq !== e.seq), e].slice(-MAX_EVENTS), version: snap.version + 1, ...(fresh ? { waiting: reduceWaiting(snap.waiting, e) } : {}) })
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
  void mutate((tasks) => [task, ...tasks])
  return () => void mutate((tasks) => tasks.filter((t) => t.id !== task.id))
}

/** Sustituye la fila optimista por la real; si el evento ya la había traído, solo quita la temporal. */
export function confirmOptimistic(tmpId: string, real: Task): void {
  void mutate((tasks) => {
    const index = tasks.findIndex((t) => t.id === tmpId)
    const rest = tasks.filter((t) => t.id !== tmpId && t.id !== real.id)
    rest.splice(index < 0 ? 0 : Math.min(index, rest.length), 0, real)
    return rest
  })
}

/** Cambia campos de una tarea en sitio (acciones optimistas del detalle); deshacer restaura solo esos campos. */
export function patchTask(id: string, patch: Partial<Task>): () => void {
  const before = getSnapshot().tasks.find((t) => t.id === id)
  void mutate((tasks) => tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  return () => {
    if (!before) return
    const keys = Object.keys(patch) as (keyof Task)[]
    void mutate((tasks) => tasks.map((t) => (t.id === id ? { ...t, ...Object.fromEntries(keys.map((k) => [k, before[k]])) } : t)))
  }
}

export function resetStore(): void {
  epoch++
  queue = Promise.resolve()
  connection?.close(); connection = null; clearTimeout(timer)
  snap = { tasks: [], events: [], loaded: false, live: false, gaps: [], version: 0, waiting: {} }
  downSince = null
  everLive = false
  emit()
}
