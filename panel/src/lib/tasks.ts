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
  codex: 'Codex', claude: 'Claude Code', meshy: 'Meshy', blender: 'Blender', unreal: 'Unreal', kratos: 'Kratos',
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
  assigneeProvider: string | null
  parentTaskId: string | null
  dependsOn: string[]
  worktreeId: string | null
  budgetId: string | null
  /** Rutas que el worker puede tocar; vacío = sin restricción declarada. */
  scope?: string[]
}

export interface Decision {
  id: string
  createdAt: string
  taskId: string
  reason: string
  evidence: { kind: string; ref: string }[]
  options: { id: string; label: string; description: string }[]
  chosenOptionId: string | null
  state: 'open' | 'resolved' | 'stale'
}

export interface Run {
  id: string; taskId: string; role: string; provider: string; state: 'running' | 'done' | 'failed' | 'cancelled'
  startedAt: string; finishedAt: string | null; summary: string | null
}

export interface TestRun {
  id: string; taskId: string; result: 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'unavailable'
  commit: string | null; map: string | null; createdAt: string
}

export interface Artifact {
  id: string; taskId: string; kind: string; path: string; license: string | null; createdAt: string
}

export interface KratosEvent {
  seq: number; id: string; type: string; messageId: string | null; payload: Record<string, unknown>; createdAt: string
}

export interface TaskDetail {
  task: Task
  runs: Run[]
  events: KratosEvent[]
  artifacts: Artifact[]
  testRuns: TestRun[]
  decision: Decision | null
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
