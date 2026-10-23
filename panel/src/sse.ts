import { token } from './api'
import type { KratosEvent } from '@/lib/tasks'

export interface Live { close: () => void }

/** Un bloque SSE (`id:`, `event:`, `data:`) → el evento del servicio, o null si es un comentario o está incompleto. */
export function parseBlock(block: string): KratosEvent | null {
  const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n')
  if (!data) return null
  try { return JSON.parse(data) as KratosEvent } catch { return null }
}

/**
 * Suscripción al /events del servicio con fetch: lleva el token en la cabecera (no en la URL) y recibe todos los tipos de evento,
 * incluidos los que añadan hitos posteriores, sin tener que listarlos. Reconecta con espera creciente y reenvía Last-Event-ID.
 */
export function connectEvents(onEvent: (e: KratosEvent) => void, onState: (live: boolean) => void): Live {
  if (typeof fetch === 'undefined' || typeof TextDecoderStream === 'undefined') return { close() {} }
  const abort = new AbortController()
  let closed = false
  let lastId = 0

  const run = async () => {
    let delay = 500
    while (!closed) {
      try {
        const res = await fetch('/events', {
          headers: { Authorization: `Bearer ${token ?? ''}`, ...(lastId ? { 'Last-Event-ID': String(lastId) } : {}) },
          signal: abort.signal,
        })
        if (!res.ok || !res.body) throw new Error(`http_${res.status}`)
        onState(true)
        delay = 500
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += value
          let end: number
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const event = parseBlock(buffer.slice(0, end))
            buffer = buffer.slice(end + 2)
            if (event) { lastId = event.seq; onEvent(event) }
          }
        }
      } catch {
        if (closed) return
      }
      onState(false)
      await new Promise((r) => setTimeout(r, delay))
      delay = Math.min(delay * 2, 5000)
    }
  }
  void run()
  return { close: () => { closed = true; abort.abort() } }
}
