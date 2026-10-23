import type { ComponentType, ReactNode, SVGProps } from 'react'
import { Info } from 'lucide-react'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { useAction } from '@/feel/useAction'
import { artifactUrl } from '@/hooks/artifact'
import { humanError } from '@/lib/errors'
import type { Artifact, TaskDetail, TestRun } from '@/lib/tasks'
import { Glyph } from '@/visual/Glyph'
import { glyphFor } from '@/visual/glyphs'

const checkLabel: Record<string, string> = {
  cpp: 'C++', blueprint: 'Blueprint', asset: 'Assets', map: 'Mapa', umg: 'UMG', build: 'Empaquetado', none: 'Sin Unreal',
}
// estados con glifo del registro; omitida y no disponible no tienen icono claro y van con texto corto
const resultGlyph: Partial<Record<TestRun['result'], [string, string]>> = {
  passed: ['done', 'Superada'], failed: ['bloqueada', 'Fallida'], running: ['probando', 'En curso'], pending: ['pendiente', 'Pendiente'],
}
const resultText: Partial<Record<TestRun['result'], string>> = { skipped: 'Omitida', unavailable: 'No disponible' }
const tones: Record<string, string> = { neutral: 'text-neutral', info: 'text-info', success: 'text-success', error: 'text-error', warning: 'text-warning', primary: 'text-primary' }
const kindLabel: Record<string, string> = { screenshot: 'Captura', report: 'Informe', build: 'Compilación' }
const when = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')
const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path

function Result({ result }: { result: TestRun['result'] }) {
  const glyph = resultGlyph[result]
  if (!glyph) return <span className="text-xs text-warning">{resultText[result]}</span>
  const spec = glyphFor('taskState', glyph[0])
  const Icon = spec.Icon as ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
  return <Icon size={16} role="img" aria-label={glyph[1]} aria-hidden={undefined} className={tones[spec.tone]} />
}

/** Pruebas de la tarea: comprobación · resultado · commit · motor · evidencia; mapa, config y fecha en el detalle. */
export function TestsTab({ detail, decisionCard }: { detail: TaskDetail; decisionCard?: ReactNode }) {
  const launch = useAction(() => api(`/tasks/${encodeURIComponent(detail.task.id)}/checks`, { method: 'POST', body: {} }),
    { success: () => ({ title: 'Pruebas encoladas', description: 'Las filas aparecen al empezar' }) })
  const evidence = (t: TestRun): Artifact[] => detail.artifacts.filter((a) => a.provenance?.testRunId === t.id)
  return (
    <div className="flex flex-col gap-4">
      {decisionCard}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={launch.pending} aria-busy={launch.pending} onClick={() => void launch.fire()}>
          {launch.pending ? 'Encolando…' : 'Lanzar pruebas'}
        </Button>
        {launch.error && <span role="alert" className="text-xs text-error">No se encolaron. {humanError(launch.error)}</span>}
      </div>
      {!detail.testRuns.length ? (
        <div className="flex flex-col items-start gap-2 py-6">
          <p className="text-sm font-medium">Esta tarea aún no tiene pruebas</p>
          <p className="text-sm text-muted-foreground">Kratos las lanza al aprobar la revisión; también puedes lanzarlas aquí.</p>
        </div>
      ) : (
        <table aria-label="Pruebas" className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="h-8 border-b border-subtle">
              <th className="font-normal">Comprobación</th><th className="font-normal">Resultado</th><th className="font-normal">Commit</th>
              <th className="font-normal">Motor</th><th className="font-normal">Evidencia</th><th className="sr-only">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {detail.testRuns.map((t) => {
              const info = `Detalle: mapa ${t.map ?? '—'} · config ${t.config ?? '—'} · ${when(t.createdAt)}`
              return (
                <tr key={t.id} className="h-10 border-b border-subtle">
                  <td>{t.checkId ? checkLabel[t.checkId] ?? t.checkId : 'Prueba'}</td>
                  <td><Result result={t.result} /></td>
                  <td className="font-mono text-xs text-muted-foreground">{t.commit?.slice(0, 7)}</td>
                  <td className="font-mono text-xs text-muted-foreground">{t.engineVersion}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      {evidence(t).map((a) => (
                        <a key={a.id} href={artifactUrl(a.id)} target="_blank" rel="noreferrer" aria-label={`${kindLabel[a.kind] ?? a.kind} ${fileName(a.path)}`}
                          className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                          <Glyph kind="artifact" value={a.kind} />
                        </a>
                      ))}
                    </span>
                  </td>
                  <td className="w-8 text-right">
                    <button type="button" aria-label={info} title={info} className="rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                      <Info size={14} aria-hidden />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
