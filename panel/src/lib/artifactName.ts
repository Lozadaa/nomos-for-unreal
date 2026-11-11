import type { Artifact } from './tasks'

export const checkNames: Record<string, string> = { acabado: 'Finish', cpp: 'C++ build', blueprint: 'Blueprints', asset: 'Assets', map: 'Map', umg: 'UMG', build: 'Package', animation: 'Animation' }
const kindNames: Record<string, string> = { model: 'Model', texture: 'Texture', screenshot: 'Screenshot', video: 'Video', build: 'Build', report: 'Report', diff: 'Changes' }
const prov = (a: Artifact) => (a.provenance ?? {}) as Record<string, unknown>
const str = (v: unknown) => typeof v === 'string' && v.trim() ? v : undefined
const fileName = (a: Artifact) => a.path.split(/[\\/]/).pop() ?? a.path

/** Nombre que se entiende sin abrir nada: nunca `log.txt`, `review-<uuid>` ni rutas (van al tooltip).
 *  El servicio lo guarda en `provenance.label`; los artefactos anteriores lo derivan de la comprobación, el tipo y la resolución. */
export function artifactName(a: Artifact): string {
  const p = prov(a), label = str(p.label)
  if (label) return label
  const check = str(p.check), res = str(p.resolution)?.replace('x', '×')
  if (a.kind === 'report' && check) return `${checkNames[check] ?? check} · log`
  if (a.kind === 'build') return `Package · ${fileName(a)}`
  if (a.kind === 'screenshot') return [check === 'umg' ? 'UMG screenshot' : check === 'map' ? 'Map check screenshot' : 'Screenshot', res].filter(Boolean).join(' ')
  if (a.kind === 'report' && /^review-/.test(fileName(a))) return 'Review · report'
  if (a.kind === 'report' && str(p.entryId)) return 'Pack check · report'
  if (p.provider === 'meshy') {
    const prompt = str(p.prompt) ?? str((p.params as Record<string, unknown> | undefined)?.prompt)
    return `${kindNames[a.kind]} Meshy${prompt ? ` · ${prompt.split(/\s+/).slice(0, 4).join(' ')}` : ''}`
  }
  return kindNames[a.kind] ?? a.kind
}

/** Las dos primeras líneas con «error» de un registro de compilación o empaquetado. */
export const isErrorLine = (line: string) => /\berror\b/i.test(line)
export const errorLines = (log: string) => log.split(/\r?\n/).filter(isErrorLine).slice(0, 2)
