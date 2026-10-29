import { useEffect, useState } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthedSrc } from '@/hooks/artifact'
import { firstErrors, verdict } from '@/lib/deliveries'
import type { Artifact } from '@/lib/tasks'
import { Glyph } from '@/visual/Glyph'

const textual = (a: Artifact) => a.kind === 'report' && /\.(txt|log|md|json)$/i.test(a.path)
/** Un veredicto que pide atención: falló, rechazado o con hallazgos, problemas o errores (no «0 errores»). */
const bad = (line: string) => /falló|rechaz|\b[1-9]\d* (hallazgo|problema|error)/.test(line)

/** Una línea: veredicto, primer error si falló y «Abrir original». El texto solo se pide al desplegar la fila. */
function ReportLine({ a }: { a: Artifact }) {
  const src = useAuthedSrc(`/artifacts/${encodeURIComponent(a.id)}/file`)
  const [text, setText] = useState<string | undefined>()
  useEffect(() => {
    if (!src || !textual(a)) return
    let alive = true
    fetch(src).then((r) => r.ok ? r.text() : undefined).then((t) => { if (alive) setText(t) }, () => {})
    return () => { alive = false }
  }, [src, a])
  const line = verdict(a, text), error = firstErrors(a, text)[0]
  // hito 23: hallazgos del revisor como filas; lo técnico (archivo:línea) solo en el tooltip
  const found = (a.provenance as { findings?: unknown } | null)?.findings
  const notes = (Array.isArray(found) ? found : []).filter((f): f is { file?: string; line?: number; severity?: string; note: string } => typeof f?.note === 'string')
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-3 px-3 py-2 text-sm">
      <Glyph kind="artifact" value={a.kind} size={16} />
      <span className={bad(line) ? 'shrink-0 text-error' : 'shrink-0'}>{line}</span>
      {error && <span title={error} className="min-w-0 truncate font-mono text-xs text-error">{error.trim()}</span>}
      {src && !(a.provenance as { removed?: unknown } | null)?.removed && <a href={src} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'ml-auto shrink-0' })}>Abrir original</a>}
      {notes.length > 0 && <ul aria-label="Hallazgos" className="flex basis-full flex-col gap-1 pl-7">
        {notes.map((f, i) => <li key={i} title={`${f.file ?? ''}:${f.line ?? ''}`} className="flex min-w-0 items-baseline gap-2">
          <Badge variant={/error|bloq|mayor/i.test(f.severity ?? '') ? 'destructive' : 'secondary'}>{f.severity ?? 'nota'}</Badge>
          <span className="min-w-0">{f.note}</span>
        </li>)}
      </ul>}
    </li>
  )
}

/** Informes y registros de una tarea: plegados por defecto; abiertos, una línea por elemento. */
export function ReportsRow({ items }: { items: Artifact[] }) {
  const [open, setOpen] = useState(false)
  return (
    <details data-part="informes" className="rounded-lg border border-subtle" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <span>Informes y registros</span><span className="tabular-nums">{items.length}</span>
      </summary>
      {open && <ul aria-label="Informes y registros" className="divide-y divide-subtle border-t border-subtle">
        {items.map((a) => <ReportLine key={a.id} a={a} />)}
      </ul>}
    </details>
  )
}
