import { providerLabel, stageLabel, stages, type KratosEvent } from './tasks'
import type { PresentationKind } from '@/visual/glyphs'

export const lanes = ['Kratos', 'Codex', 'Claude Code', 'OpenCode', 'Meshy', 'Blender', 'Unreal', 'Compilaciones'] as const
export type Lane = (typeof lanes)[number]
type Providers = ReadonlyMap<string, string>
const sourceProviders: Record<string, string> = { kratos: 'kratos', codex: 'codex', claude: 'claude', 'claude code': 'claude', opencode: 'opencode', meshy: 'meshy', blender: 'blender', unreal: 'unreal', compilaciones: 'launcher', builds: 'launcher', launcher: 'launcher' }
const providerLanes: Record<string, Lane> = { kratos: 'Kratos', codex: 'Codex', claude: 'Claude Code', opencode: 'OpenCode', meshy: 'Meshy', blender: 'Blender', unreal: 'Unreal', launcher: 'Compilaciones' }

/** Proveedor declarado por el evento o comprobado para su ejecución; nunca se toma del responsable de la tarea. */
export function eventProvider(e: KratosEvent, providers?: Providers): string | undefined {
  if (typeof e.payload.provider === 'string' && e.payload.provider.trim()) return e.payload.provider.trim().toLowerCase()
  const source = typeof e.payload.source === 'string' ? e.payload.source.trim().toLowerCase() : ''
  if (Object.hasOwn(sourceProviders, source)) return sourceProviders[source]
  return typeof e.payload.runId === 'string' ? providers?.get(e.payload.runId) : undefined
}

/** Carril de un evento: la fuente que declara (semilla, workers) o, si no, quien lo provoca; por defecto, Kratos. */
export function laneOf(e: KratosEvent, providers?: Providers): Lane {
  const provider = eventProvider(e, providers)
  return provider && Object.hasOwn(providerLanes, provider) ? providerLanes[provider] : 'Kratos'
}

/** Usa el estado del evento cuando existe; la entidad neutral del registro evita inventar estados actuales. */
export function eventPresentation(e: KratosEvent, providers?: Providers): { kind: PresentationKind; value: string } {
  const family = e.type.split('.')[0]
  if (family === 'task') {
    if (e.type === 'task.blocked') return { kind: 'taskState', value: 'bloqueada' }
    const state = String(e.payload.state ?? e.payload.to ?? '')
    if ([...stages, 'bloqueada', 'decision'].some((known) => known === state)) return { kind: 'taskState', value: state }
  }
  if (family === 'run' || family === 'worker') {
    const provider = eventProvider(e, providers)
    if (provider) return { kind: 'provider', value: provider }
  }
  return { kind: 'event', value: e.type }
}

const HOUR = 3_600_000
/** Tres niveles con 8 % de separación. Los 101 bins ordenan posiciones en O(n), sin depender de la secuencia. */
export function placeEvents(positions: readonly number[]): { track: number; compact: boolean }[] {
  const placed = positions.map(() => ({ track: 0, compact: false }))
  const bins: number[][] = Array.from({ length: 101 }, () => [])
  positions.forEach((position, index) => bins[Math.floor(Math.max(0, Math.min(100, Number.isFinite(position) ? position : 0)))].push(index))
  const nextFree = [-Infinity, -Infinity, -Infinity]
  const previous = [-1, -1, -1]
  for (const bin of bins) for (const index of bin) {
    const position = positions[index]
    let track = nextFree.findIndex((free) => position >= free)
    if (track < 0) {
      // Compacta también las etiquetas anteriores del grupo; de otro modo los puntos las taparían.
      for (const prior of previous) if (prior >= 0) placed[prior].compact = true
      track = nextFree.indexOf(Math.min(...nextFree))
      placed[index] = { track, compact: true }
    } else {
      nextFree[track] = position + 8
      previous[track] = index
      placed[index].track = track
    }
  }
  return placed
}

/** Últimas 24 horas de la ventana recibida, ancladas al último evento válido; los ceros no garantizan cobertura. */
export function hourlyActivity(events: readonly KratosEvent[], providers?: Providers): { start: number; end: number; lanes: { label: Lane; values: number[] }[] } {
  let latest = -Infinity
  for (const event of events) { const time = Date.parse(event.createdAt); if (Number.isFinite(time)) latest = Math.max(latest, time) }
  const end = (Math.floor((Number.isFinite(latest) ? latest : Date.now()) / HOUR) + 1) * HOUR
  const start = end - 24 * HOUR
  const series = new Map<Lane, number[]>(lanes.map((lane) => [lane, Array<number>(24).fill(0)]))
  for (const event of events) {
    const bucket = Math.floor((Date.parse(event.createdAt) - start) / HOUR)
    if (bucket >= 0 && bucket < 24) series.get(laneOf(event, providers))![bucket]++
  }
  return { start, end, lanes: lanes.map((label) => ({ label, values: series.get(label)! })) }
}

export function eventText(e: KratosEvent, providers?: Providers): string {
  const p = e.payload
  const stage = (value: unknown) => stageLabel[value as keyof typeof stageLabel] ?? String(value ?? '')
  const provider = eventProvider(e, providers)
  switch (e.type) {
    case 'task.created': return 'Tarea creada'
    case 'task.activity': return `Actividad de ${String(p.source ?? 'Kratos')}`
    case 'task.moved': return `${p.from ? `Pasó de ${stage(p.from)} a` : 'Pasó a'} ${stage(p.state ?? p.to)}${p.reason ? ` · ${String(p.reason)}` : ''}`
    case 'task.blocked': return `Bloqueada: ${String(p.reason)}`
    case 'decision.opened': return `Se pidió una decisión: ${String(p.reason)}`
    case 'decision.resolved': return `Decisión resuelta por ${String(p.by)}`
    case 'run.started': return `Ejecución iniciada${provider ? ` con ${providerLabel[provider] ?? provider}` : ''}`
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
