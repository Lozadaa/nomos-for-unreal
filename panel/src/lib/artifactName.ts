import type { Artifact } from './tasks'

/** Filtros de Entregas: los tipos del registro de glifos `artifact/*`; «Registros» son los logs de las comprobaciones. */
export const artifactTypes = ['capturas', 'informes', 'registros', 'modelos', 'compilaciones'] as const
export type ArtifactType = (typeof artifactTypes)[number]
export const artifactTypeLabel: Record<ArtifactType, string> = {
  capturas: 'Capturas', informes: 'Informes', registros: 'Registros', modelos: 'Modelos', compilaciones: 'Compilaciones',
}
export const orders = ['recientes', 'tarea', 'tipo'] as const
export type Order = (typeof orders)[number]
export const orderLabel: Record<Order, string> = { recientes: 'Más recientes', tarea: 'Por tarea', tipo: 'Por tipo' }

const checkNames: Record<string, string> = { cpp: 'Compilación C++', blueprint: 'Blueprints', asset: 'Assets', map: 'Mapa', umg: 'UMG', build: 'Empaquetado', animation: 'Animación' }
const kindNames: Record<string, string> = { model: 'Modelo', texture: 'Textura', screenshot: 'Captura', video: 'Vídeo', build: 'Compilación', report: 'Informe', diff: 'Cambios' }
const prov = (a: Artifact) => (a.provenance ?? {}) as Record<string, unknown>
const str = (v: unknown) => typeof v === 'string' && v.trim() ? v : undefined
export const fileName = (a: Artifact) => a.path.split(/[\\/]/).pop() ?? a.path

/** Tipo del filtro. Un informe con `check` es el log de una comprobación: un registro. */
export function artifactType(a: Artifact): ArtifactType {
  if (a.kind === 'screenshot' || a.kind === 'video') return 'capturas'
  if (a.kind === 'model' || a.kind === 'texture') return 'modelos'
  if (a.kind === 'build') return 'compilaciones'
  return a.kind === 'report' && str(prov(a).check) ? 'registros' : 'informes'
}

/** Nombre que se entiende sin abrir nada: nunca `log.txt`, `review-<uuid>` ni rutas (van al tooltip).
 *  El servicio lo guarda en `provenance.label`; los artefactos anteriores lo derivan de la comprobación, el tipo y la resolución. */
export function artifactName(a: Artifact): string {
  const p = prov(a), label = str(p.label)
  if (label) return label
  const check = str(p.check), res = str(p.resolution)?.replace('x', '×')
  if (a.kind === 'report' && check) return `${checkNames[check] ?? check} · registro`
  if (a.kind === 'build') return `Empaquetado · ${fileName(a)}`
  if (a.kind === 'screenshot') return [check === 'umg' ? 'Captura UMG' : check === 'map' ? 'Captura de control' : 'Captura', res].filter(Boolean).join(' ')
  if (a.kind === 'report' && /^review-/.test(fileName(a))) return 'Revisión · informe'
  if (a.kind === 'report' && str(p.entryId)) return 'Verificación de pack · informe'
  if (p.provider === 'meshy') {
    const prompt = str(p.prompt) ?? str((p.params as Record<string, unknown> | undefined)?.prompt)
    return `${kindNames[a.kind]} Meshy${prompt ? ` · ${prompt.split(/\s+/).slice(0, 4).join(' ')}` : ''}`
  }
  return kindNames[a.kind] ?? a.kind
}

const typeRank: Record<ArtifactType, number> = { capturas: 0, modelos: 1, compilaciones: 2, informes: 3, registros: 4 }
const newest = (a: Artifact, b: Artifact) => b.createdAt.localeCompare(a.createdAt)

/** Grupos de la vista: una lista plana (recientes), por tarea (capturas antes que informes) o por tipo. */
export function groupArtifacts(list: Artifact[], order: Order, taskTitle: (id: string) => string): { key: string; title: string | null; items: Artifact[] }[] {
  if (order === 'recientes') return [{ key: 'todas', title: null, items: [...list].sort(newest) }]
  const groups = new Map<string, Artifact[]>()
  const keyOf = (a: Artifact) => order === 'tarea' ? a.taskId : artifactType(a)
  for (const a of [...list].sort(newest)) groups.set(keyOf(a), [...(groups.get(keyOf(a)) ?? []), a])
  const entries = [...groups]
  if (order === 'tipo') entries.sort(([a], [b]) => typeRank[a as ArtifactType] - typeRank[b as ArtifactType])
  return entries.map(([key, items]) => ({
    key, title: order === 'tarea' ? taskTitle(key) : artifactTypeLabel[key as ArtifactType],
    items: order === 'tarea' ? [...items].sort((a, b) => typeRank[artifactType(a)] - typeRank[artifactType(b)] || newest(a, b)) : items,
  }))
}

/** Las dos primeras líneas con «error» de un registro de compilación o empaquetado. */
export const isErrorLine = (line: string) => /\berror\b/i.test(line)
export const errorLines = (log: string) => log.split(/\r?\n/).filter(isErrorLine).slice(0, 2)
export const isBuildLog = (a: Artifact) => artifactType(a) === 'registros' && ['cpp', 'build'].includes(String(prov(a).check))
