import { artifactName, checkNames, errorLines, isErrorLine } from './artifactName'
import type { Artifact } from './tasks'

/** Entregas para mirar (hito 10): primero lo que se ve, lo textual al final y resumido en una línea. */
export const deliveryTypes = ['capturas', 'videos', 'modelos', 'informes'] as const
export type DeliveryType = (typeof deliveryTypes)[number]
export const deliveryTypeLabel: Record<DeliveryType, string> = { capturas: 'Screenshots', videos: 'Videos', modelos: 'Models', informes: 'Reports' }

const prov = (a: Artifact) => (a.provenance ?? {}) as Record<string, unknown>
export const deliveryType = (a: Artifact): DeliveryType =>
  a.kind === 'screenshot' ? 'capturas' : a.kind === 'video' ? 'videos' : a.kind === 'model' || a.kind === 'texture' ? 'modelos' : 'informes'

const viewOrder = ['player', 'left', 'right', 'top']
const viewNames: Record<string, string> = { player: 'Player', left: '3/4 left', right: '3/4 right', top: 'Top-down' }
/** Rótulo del ángulo dentro de la galería; sin vista, el nombre del artefacto. */
export const viewLabel = (a: Artifact) => prov(a).sheet ? 'Contact sheet' : prov(a).visual === 'diff' ? 'Diff against baseline'
  : viewNames[String(prov(a).view)] ?? artifactName(a)

/** Una tarjeta visual: la portada (la hoja de contactos si la hay) y las imágenes que se recorren en la galería. */
export type VisualSet = { key: string; cover: Artifact; items: Artifact[] }
export type TaskSection = { taskId: string; title: string; newest: string; visuals: VisualSet[]; models: Artifact[]; reports: Artifact[] }

const newest = (a: Artifact, b: Artifact) => b.createdAt.localeCompare(a.createdAt)
const rank = (a: Artifact) => prov(a).visual === 'diff' ? 9 : Math.max(viewOrder.indexOf(String(prov(a).view)), 0)

/** Las capturas de una misma comprobación (testRunId) forman un conjunto; un vídeo va solo. */
function visualSets(list: Artifact[]): VisualSet[] {
  const sets = new Map<string, Artifact[]>()
  for (const a of list) {
    const run = a.kind === 'screenshot' ? prov(a).testRunId : undefined
    const key = typeof run === 'string' ? `run:${run}` : a.id
    sets.set(key, [...(sets.get(key) ?? []), a])
  }
  return [...sets].map(([key, all]) => {
    const sheet = all.find((a) => prov(a).sheet), images = all.filter((a) => !prov(a).sheet).sort((a, b) => rank(a) - rank(b) || newest(b, a))
    return { key, cover: sheet ?? images[0], items: images.length ? images : all }
  })
}

/** Por tarea, la que tiene la entrega más reciente arriba. */
export function taskSections(list: Artifact[], taskTitle: (id: string) => string): TaskSection[] {
  const byTask = new Map<string, Artifact[]>()
  for (const a of [...list].sort(newest)) byTask.set(a.taskId, [...(byTask.get(a.taskId) ?? []), a])
  return [...byTask].map(([taskId, items]) => ({
    taskId, title: taskTitle(taskId), newest: items[0].createdAt,
    visuals: visualSets(items.filter((a) => ['capturas', 'videos'].includes(deliveryType(a)))),
    models: items.filter((a) => deliveryType(a) === 'modelos'),
    reports: items.filter((a) => deliveryType(a) === 'informes'),
  }))
}

const results: Record<string, string> = { passed: 'passed', failed: 'failed', skipped: 'skipped', unavailable: 'unavailable', running: 'running', pending: 'pending' }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const subject = (a: Artifact) => artifactName(a).split(' · ')[0]

/** Lo que dice un informe JSON o Markdown en una palabra o una cifra; null si no lo dice. */
function readText(text: string): string | null {
  try {
    const json = JSON.parse(text) as Record<string, unknown>
    const problems = [json.findings, json.issues, json.errors].find(Array.isArray) as unknown[] | undefined
    if (json.approved === true || json.ok === true || json.passed === true) return 'approved'
    if (problems?.length) return plural(problems.length, 'issue', 'issues')
    if (typeof json.result === 'string') return results[json.result] ?? json.result
    return json.approved === false || json.ok === false ? 'rejected' : null
  } catch { /* Markdown o texto */ }
  return /^\s*(?:\*\*)?(?:veredicto|resultado)(?:\*\*)?\s*:\s*\**([^\n*]+)/im.exec(text)?.[1].trim().toLocaleLowerCase('es') ?? null
}

/** Una línea por informe: comprobación y resultado, cifras clave si el texto está a mano. Nunca el informe entero. */
export function verdict(a: Artifact, text?: string): string {
  const p = prov(a), check = typeof p.check === 'string' ? p.check : null
  // hito 19: la limpieza borra los paquetes de las comprobaciones; solo queda la build actual
  if (a.kind === 'build') return p.removed === true ? 'Package · removed (only the current build is kept)' : 'Package · executable ready'
  if (p.kind === 'REVIEW' || /^review-/.test(a.path.split(/[\\/]/).pop() ?? '')) {
    let read: Record<string, unknown> = {}
    try { read = text ? JSON.parse(text) : {} } catch { /* sin JSON, la procedencia */ }
    const list = Array.isArray(p.findings) ? p.findings : read.findings
    const findings = Array.isArray(list) ? list.length : null
    return p.approved === true ? 'Review · approved' : findings ? `Review · ${plural(findings, 'finding', 'findings')}` : 'Review · rejected'
  }
  if (check && typeof p.result === 'string' && !p.source) {
    const name = checkNames[check] ?? check
    if (text !== undefined && ['cpp', 'build', 'blueprint'].includes(check)) return `${name} · ${plural(text.split(/\r?\n/).filter(isErrorLine).length, 'error', 'errors')}`
    return `${name} · ${results[p.result] ?? p.result}`
  }
  const said = text === undefined ? null : readText(text)
  return said ? `${subject(a)} · ${said}` : artifactName(a)
}

/** Los dos primeros errores, solo para un registro que falló. */
export const firstErrors = (a: Artifact, text?: string) => text !== undefined && prov(a).result === 'failed' ? errorLines(text) : []

/** Pie de la tarjeta: «Mapa · 4 vistas» para una comprobación con varios ángulos; si no, el nombre del artefacto. */
export function setCaption(set: VisualSet): string {
  const check = String(prov(set.cover).check ?? '')
  const what = set.items.every((a) => prov(a).view) ? 'views' : 'screenshots'
  return set.items.length > 1 && checkNames[check] ? `${checkNames[check]} · ${set.items.length} ${what}` : artifactName(set.cover)
}
/** Título de una imagen en el visor: «Mapa · Jugador» si es una vista; si no, su nombre. */
export const viewerName = (a: Artifact) => {
  const check = checkNames[String(prov(a).check)]
  return prov(a).view && check ? `${check} · ${viewLabel(a)}` : artifactName(a)
}
/** 3,67 s → «0:04». */
export function duration(seconds: unknown): string | null {
  if (typeof seconds !== 'number' || seconds <= 0) return null
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
