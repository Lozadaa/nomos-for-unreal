import { useEffect, useState } from 'react'
import { api } from '@/api'
import type { Run } from '@/lib/tasks'
import { getSnapshot, subscribe } from '@/store'

export type LiveRun = Run & { waiting: boolean }
/** Espera tras el último evento antes de leer los runs: agrupa una ráfaga en una lectura por run. */
const coalesceMs = 120
type RunResponse = { run: Run; latestStatus: { waiting: boolean } }
type Entry = {
  id: string; revision: number; requested: number; latestSeq: number; latestWorkerSeq: number
  pending: boolean; waitingSignal: boolean; value?: LiveRun
}

/**
 * La API no ofrece una colección de runs: solo se consultan ids vistos en eventos.
 * La ventana inicial puede omitir ejecuciones históricas; no se infieren sus estados.
 * Un único consumidor por vista comparte el lookup entre todas sus filas.
 */
export function useRuns(): LiveRun[] {
  const [runs, setRuns] = useState<LiveRun[]>([])
  useEffect(() => {
    let alive = true
    // Conserva los ids aunque su evento deje la ventana de 500 del store.
    const entries = new Map<string, Entry>()
    const publish = () => setRuns([...entries.values()].flatMap((entry) => entry.value ? [entry.value] : []))
    const read = (entry: Entry) => {
      if (entry.pending || entry.requested === entry.revision) return
      entry.pending = true
      const revision = entry.revision
      entry.requested = revision
      void api<RunResponse>(`/runs/${encodeURIComponent(entry.id)}`).then(
        (data) => {
          // Un fin recibido durante el GET invalida su respuesta inicial atrasada.
          if (!alive || entry.revision !== revision || data.run?.id !== entry.id || typeof data.latestStatus?.waiting !== 'boolean') return
          entry.value = { ...data.run, waiting: data.latestStatus.waiting }
          publish()
        },
        () => { /* Sin respuesta verificada no se crea ni se modifica un run. */ },
      ).finally(() => {
        entry.pending = false
        if (alive && entry.revision !== revision) read(entry)
      })
    }
    const observe = () => {
      for (const event of getSnapshot().events) {
        const id = event.payload.runId
        if (typeof id !== 'string' || !id.trim()) continue
        let entry = entries.get(id)
        if (!entry) {
          entry = { id, revision: 0, requested: -1, latestSeq: -1, latestWorkerSeq: -1, pending: false, waitingSignal: false }
          entries.set(id, entry)
        }
        if (event.type.startsWith('run.') && event.seq > entry.latestSeq) {
          entry.latestSeq = event.seq
          entry.revision++
        }
        // La salida solo merece otra lectura si puede cerrar una espera conocida.
        if (/^worker\.(waiting|output|message_sent)$/.test(event.type) && event.seq > entry.latestWorkerSeq) {
          entry.latestWorkerSeq = event.seq
          if (event.type === 'worker.waiting') {
            entry.waitingSignal = true
            entry.revision++
          } else if (entry.waitingSignal || entry.value?.waiting || entry.pending) {
            entry.waitingSignal = false
            entry.revision++
          }
        }
      }
      // hito 10: la reproducción del SSE llega a ráfagas (con datos reales, 170 lecturas en 5 s); se agrupan
      // límite de frecuencia: una ráfaga sin pausa no aplaza las lecturas indefinidamente
      flush ??= setTimeout(() => { flush = undefined; for (const entry of entries.values()) read(entry) }, coalesceMs)
    }
    let flush: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = subscribe(observe)
    observe()
    return () => { alive = false; clearTimeout(flush); unsubscribe() }
  }, [])
  return runs
}
