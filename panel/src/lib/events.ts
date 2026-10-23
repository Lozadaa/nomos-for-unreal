import { providerLabel, type KratosEvent } from './tasks'

export const lanes = ['Kratos', 'Codex', 'Claude Code', 'Meshy', 'Blender', 'Unreal', 'Compilaciones'] as const
export type Lane = (typeof lanes)[number]

/** Carril de un evento: la fuente que declara (semilla, workers) o, si no, quien lo provoca; por defecto, Kratos. */
export function laneOf(e: KratosEvent): Lane {
  const named = String(e.payload.source ?? (e.type === 'run.started' ? providerLabel[String(e.payload.provider)] ?? '' : ''))
  return lanes.find((l) => l.toLowerCase() === named.toLowerCase()) ?? 'Kratos'
}

export function eventText(e: KratosEvent): string {
  const p = e.payload
  switch (e.type) {
    case 'task.created': return 'Tarea creada'
    case 'task.activity': return `Actividad de ${String(p.source ?? 'Kratos')}`
    case 'task.moved': return `Pasó de ${String(p.from)} a ${String(p.state)}${p.reason ? ` · ${String(p.reason)}` : ''}`
    case 'task.blocked': return `Bloqueada: ${String(p.reason)}`
    case 'decision.opened': return `Se pidió una decisión: ${String(p.reason)}`
    case 'decision.resolved': return `Decisión resuelta por ${String(p.by)}`
    case 'run.started': return `Ejecución iniciada con ${providerLabel[String(p.provider)] ?? String(p.provider)}`
    case 'run.finished': return `Ejecución terminada (${String(p.state)})${p.summary ? ` · ${String(p.summary)}` : ''}`
    case 'artifact.created': return 'Nuevo asset'
    case 'message.received': return 'Mensaje recibido'
    case 'message.acked': return 'Kratos confirmó el mensaje'
    case 'reply.published': return 'Kratos respondió'
    case 'director.started': return 'Kratos empezó a escuchar'
    case 'director.stopped': return 'Kratos dejó de escuchar'
    default: return e.type
  }
}
