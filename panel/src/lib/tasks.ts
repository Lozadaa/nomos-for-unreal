import { BRAND } from '@/lib/brand'
export const stages = ['pendiente', 'preparada', 'implementando', 'revisando', 'probando', 'integrando', 'cerrando', 'done'] as const
export type Stage = (typeof stages)[number]

export const stageLabel: Record<Stage, string> = {
  pendiente: 'Pendiente', preparada: 'Preparada', implementando: 'Implementando', revisando: 'Revisando',
  probando: 'Probando', integrando: 'Integrando', cerrando: 'Cerrando', done: 'Hecha',
}

export const areas = ['gameplay', 'ui', 'escenarios', 'assets', 'animacion', 'audio', 'qa', 'builds'] as const
export type Area = (typeof areas)[number]
export const areaLabel: Record<Area, string> = {
  gameplay: 'Gameplay', ui: 'Interfaz', escenarios: 'Escenarios', assets: 'Assets',
  animacion: 'Animación', audio: 'Audio', qa: 'Calidad', builds: 'Compilaciones',
}

export const providerLabel: Record<string, string> = {
  codex: 'Codex', claude: 'Claude Code', opencode: 'OpenCode', meshy: 'Meshy', blender: 'Blender', unreal: 'Unreal', nomos: BRAND.short, launcher: 'Launcher',
}

export interface Task {
  id: string
  createdAt: string
  updatedAt: string
  title: string
  spec: string
  acceptance: string[]
  state: Stage
  blockedReason: string | null
  decisionId: string | null
  area: Area
  assigneeRole: string | null
  /** hito 13: mayor arranca antes; 0 (o ausente) no se enseña */
  priority?: number
  assigneeProvider: string | null
  parentTaskId: string | null
  dependsOn: string[]
  worktreeId: string | null
  budgetId: string | null
  /** Rutas que el worker puede tocar; vacío = sin restricción declarada. */
  scope?: string[]
  /** Por qué espera (reserva, pausa, cierre bloqueado…). */
  waitReason?: string | null
  /** Hito 6: quién hizo qué (implemento, reviso, genero, integro, verifico) y carpeta de archivo al cerrar. */
  attribution?: Record<string, { runId: string; provider: string; agentName: string; at: string }[]>
  archivePath?: string | null
  failure?: { kind: FailureKind; text: string; detail: string | null; at: string }
}

export interface Decision {
  id: string
  createdAt: string
  taskId: string
  reason: string
  evidence: { kind: string; ref: string }[]
  /** Hito 7: miniatura propia (catálogo, Meshy) y la opción recomendada, que lleva el único acento. */
  options: { id: string; label: string; description: string; thumbnail?: string; recommended?: boolean }[]
  chosenOptionId: string | null
  state: 'open' | 'resolved' | 'stale'
  /** Hito 20: veces que el mismo problema volvió a pedir esta Decisión. */
  seenCount?: number
}

export interface Run {
  id: string; taskId: string; role: string; provider: string; state: 'running' | 'done' | 'failed' | 'cancelled'
  startedAt: string; finishedAt: string | null; summary: string | null
  /** Estado persistido por el servicio; permite restaurar la espera al recargar. */
  metadata?: { waiting?: boolean; confirmedSkills?: string[]; model?: string }
}

export interface TestRun {
  id: string; taskId: string; result: 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'unavailable'
  commit: string | null; map: string | null; createdAt: string
  /** Comprobación (hito 5): cpp, blueprint, asset, map, umg, build o none (el diff no toca Unreal). */
  checkId?: string | null; runId?: string | null; engineVersion?: string | null; config?: string | null; reportPath?: string | null
}

export interface Artifact {
  id: string; taskId: string; kind: string; path: string; license: string | null; createdAt: string; runId?: string | null
  previewPath?: string | null; provenance?: Record<string, unknown>
}

export interface NomosEvent {
  seq: number; id: string; type: string; messageId: string | null; payload: Record<string, unknown>; createdAt: string
}

export interface TaskDetail {
  task: Task
  runs: Run[]
  events: NomosEvent[]
  artifacts: Artifact[]
  testRuns: TestRun[]
  decision: Decision | null
  /** Hito 24: una fila por run medida; `note` es el JSON del uso o «sin transcripción». */
  tokens?: { runId: string; amount: number; note: string | null }[]
}

/** Tokens en millones con una decimal («1,3 M»): nunca cifras largas. */
export const millions = (n: number) => `${(n / 1e6).toLocaleString('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`
/** «Tokens: 1,3 M · 42 turnos · opus» de una fila de `spends`. */
export function tokensLine(row: { amount: number; note: string | null }): string {
  let use: { turns?: number; model?: string } = {}
  try { use = JSON.parse(row.note ?? '') } catch { return `Tokens: ${millions(row.amount)} · ${row.note ?? ''}` }
  return `Tokens: ${millions(row.amount)} · ${use.turns ?? 0} turnos · ${/opus|sonnet|haiku/.exec(use.model ?? '')?.[0] ?? use.model}`
}

/** Estado derivado: una tarea bloqueada o en espera de decisión conserva su etapa. */
export type Status = 'normal' | 'bloqueada' | 'decision'
export const statusOf = (t: Pick<Task, 'blockedReason' | 'decisionId'>): Status =>
  t.decisionId ? 'decision' : t.blockedReason ? 'bloqueada' : 'normal'

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

export function toneOf(t: Pick<Task, 'state' | 'blockedReason' | 'decisionId'>): Tone {
  const s = statusOf(t)
  if (s === 'decision') return 'warning'
  if (s === 'bloqueada') return t.state === 'cerrando' ? 'warning' : 'error'
  if (t.state === 'done') return 'success'
  if (t.state === 'pendiente' || t.state === 'preparada') return 'neutral'
  return 'info'
}

/** Texto de estado de la fila: copy de docs/diseno/estados.md. */
export function statusText(t: Pick<Task, 'state' | 'blockedReason' | 'decisionId'>): string {
  const s = statusOf(t)
  if (s === 'decision') return 'Espera decisión'
  if (s === 'bloqueada') return t.state === 'cerrando' ? 'No se pudo cerrar' : 'Bloqueada'
  return stageLabel[t.state]
}

export const shortId = (id: string) => id.replace(/^tmp-/, '').slice(0, 7)
export const isTemp = (id: string) => id.startsWith('tmp-')

/** Hito 7: estado de fallo de la orden más reciente de la tarea (lo calcula el servicio en /tasks). */
export type FailureKind = 'connection' | 'execution' | 'cancel_requested' | 'cancel_confirmed' | 'capability_missing'
export const failureShort: Record<FailureKind, string> = {
  connection: 'Sin conexión', execution: 'Ejecución fallida', cancel_requested: 'Cancelación solicitada',
  cancel_confirmed: 'Cancelación confirmada', capability_missing: 'Falta una capacidad',
}

/** Motivo de tres palabras como mucho para la fila de Producción: el fallo primero, después la espera. */
export function rowReason(t: Pick<Task, 'waitReason' | 'failure'> & Partial<Pick<Task, 'blockedReason' | 'decisionId'>>): string | null {
  if (t.failure) return failureShort[t.failure.kind] ?? null
  const reason = t.waitReason?.trim()
  // bloqueada o esperando Decisión: el glifo de estado ya lo dice y el motivo completo está en el detalle
  if (!reason || t.decisionId || t.blockedReason) return null
  if (/^Esperando reserva|^Editor de .*: ocupado/.test(reason)) return 'Esperando reserva'
  if (reason.startsWith('Director en pausa')) return 'Director en pausa'
  if (reason.startsWith('Depende de')) return 'Depende de…'
  const head = reason.split(':')[0].trim()
  if (head !== reason && head.split(/\s+/).length <= 3) return head
  const words = reason.split(/\s+/)
  return words.length <= 3 ? reason : `${words.slice(0, 3).join(' ')}…`
}
