import type { Artifact } from './tasks'

export const checkNames: Record<string, string> = { cpp: 'Compilación C++', blueprint: 'Blueprints', asset: 'Assets', map: 'Mapa', umg: 'UMG', build: 'Empaquetado', animation: 'Animación' }
const kindNames: Record<string, string> = { model: 'Modelo', texture: 'Textura', screenshot: 'Captura', video: 'Vídeo', build: 'Compilación', report: 'Informe', diff: 'Cambios' }
const prov = (a: Artifact) => (a.provenance ?? {}) as Record<string, unknown>
const str = (v: unknown) => typeof v === 'string' && v.trim() ? v : undefined
const fileName = (a: Artifact) => a.path.split(/[\\/]/).pop() ?? a.path

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

/** Las dos primeras líneas con «error» de un registro de compilación o empaquetado. */
export const isErrorLine = (line: string) => /\berror\b/i.test(line)
export const errorLines = (log: string) => log.split(/\r?\n/).filter(isErrorLine).slice(0, 2)
