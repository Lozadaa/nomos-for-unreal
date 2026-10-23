import { token } from './api'
import type { KratosEvent } from '@/lib/tasks'

export interface Live { close: () => void }

/** Suscripción al /events del servicio. EventSource reconecta solo y reenvía Last-Event-ID. */
export function connectEvents(onEvent: (e: KratosEvent) => void, onState: (live: boolean) => void): Live {
  if (typeof EventSource === 'undefined') return { close() {} }
  const source = new EventSource(`/events?token=${encodeURIComponent(token ?? '')}`)
  source.onopen = () => onState(true)
  source.onerror = () => onState(false)
  // el servidor nombra cada evento por su tipo; un único oyente genérico los recoge todos
  const types = ['task.created', 'task.moved', 'task.blocked', 'decision.opened', 'decision.resolved', 'run.started', 'run.finished',
    'artifact.created', 'message.received', 'message.acked', 'reply.published', 'director.started', 'director.stopped']
  for (const type of types) source.addEventListener(type, (m) => onEvent(JSON.parse((m as MessageEvent).data) as KratosEvent))
  return { close: () => source.close() }
}
