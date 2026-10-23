import { useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router'
import { EmptyState } from '@/components/EmptyState'
import { animateUpdate, withViewTransition } from '@/feel/transitions'
import { eventText, laneOf, lanes } from '@/lib/events'
import type { KratosEvent } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

const clock = (iso: number | string) => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
const TEN_MIN = 10 * 60_000

/** Eje estable: el final sube de diez en diez minutos, así una entrada nueva no mueve el resto de golpe. */
function axis(times: number[]): [number, number] {
  const min = Math.min(...times)
  const max = Math.ceil((Math.max(...times) + 1) / TEN_MIN) * TEN_MIN
  return [min, Math.max(max, min + TEN_MIN)]
}

export function Actividad() {
  const events = useStore((s) => s.events)
  const tasks = useStore((s) => s.tasks)
  const gaps = useStore((s) => s.gaps)
  const [taskId, setTaskId] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const navigate = useNavigate()

  const titleOf = (id: unknown) => tasks.find((t) => t.id === id)?.title
  const visible = useMemo(() => events.filter((e) => !taskId || e.payload.taskId === taskId), [events, taskId])
  const [min, max] = useMemo(() => axis(visible.length ? visible.map((e) => Date.parse(e.createdAt)) : [Date.now()]), [visible])
  const pct = (t: number | string) => `${(((typeof t === 'string' ? Date.parse(t) : t) - min) / (max - min)) * 100}%`
  const byLane = useMemo(() => lanes.map((lane) => ({ lane, items: visible.filter((e) => laneOf(e) === lane) })), [visible])
  const detail = visible.find((e) => e.seq === selected)

  const label = (e: KratosEvent) => `${eventText(e)}${titleOf(e.payload.taskId) ? ` · ${titleOf(e.payload.taskId)}` : ''}`
  const cause = detail ? events.find((e) => e.id === detail.payload.correlation) : undefined
  const effects = detail ? events.filter((e) => e.payload.correlation === detail.id) : []
  const filter = (id: string) => void animateUpdate(() => flushSync(() => { setTaskId(id); setSelected(null) }))

  if (events.length === 0) {
    return <EmptyState title="Aún no hay actividad" hint="Aparecerá cuando Kratos empiece a trabajar." action={{ label: 'Nueva petición', onClick: () => void withViewTransition(() => navigate('/?nueva=1', { flushSync: true })) }} />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Tarea
          <select value={taskId} onChange={(e) => filter(e.target.value)} className="h-8 max-w-64 rounded-md border border-input bg-background px-2 text-sm text-foreground">
            <option value="">Todas</option>
            {tasks.filter((t) => !t.id.startsWith('tmp-')).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </label>
        <span className="ml-auto font-mono text-xs text-muted-foreground">{clock(min)} – {clock(max)}</span>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-subtle"><EmptyState title="Ningún evento coincide con el filtro" action={{ label: 'Quitar filtro', onClick: () => filter('') }} /></div>
      ) : (
        <section aria-label="Actividad por carriles" className="overflow-hidden rounded-lg border border-subtle">
          {byLane.map(({ lane, items }) => (
            <div key={lane} role="group" aria-label={lane} className="grid grid-cols-[140px_minmax(0,1fr)] border-b border-subtle last:border-b-0 [contain-intrinsic-size:auto_44px] [content-visibility:auto]">
              <h2 className="flex items-center px-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">{lane}</h2>
              <div className="relative mx-4 h-11">
                {gaps.map((g) => (
                  <span key={g.from} aria-hidden title={`Sin datos de ${clock(g.from)} a ${clock(g.to)} · servicio desconectado`}
                    className="absolute inset-y-1 border-x border-dashed border-subtle bg-card" style={{ left: pct(g.from), width: `calc(${pct(g.to)} - ${pct(g.from)})` }} />
                ))}
                {items.map((e) => (
                  <button
                    key={e.seq}
                    type="button"
                    aria-label={label(e)}
                    aria-pressed={selected === e.seq}
                    onClick={() => setSelected(e.seq)}
                    style={{ left: pct(e.createdAt) }}
                    className="group absolute top-1/2 flex size-5 -translate-x-1/2 -translate-y-1/2 animate-in items-center justify-center fade-in transition-[left] duration-(--k-dur-reorder) ease-k outline-offset-2"
                  >
                    <span className={cn('size-2 rounded-full transition-transform duration-(--k-dur-micro)', laneTone(e), 'group-hover:scale-150 group-aria-pressed:scale-150 group-aria-pressed:ring-2 group-aria-pressed:ring-foreground/40')} />
                    <span role="tooltip" className="pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max max-w-72 rounded-md border border-subtle bg-popover px-2 py-1 text-xs text-popover-foreground group-hover:block group-focus-visible:block">{label(e)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {detail && (
        <section aria-label="Evento seleccionado" className="flex flex-col gap-2 rounded-lg border border-subtle bg-card p-4 text-sm">
          <h3 className="font-medium">{label(detail)}</h3>
          <p className="text-muted-foreground">{clock(detail.createdAt)} · {laneOf(detail)}</p>
          <p><span className="text-muted-foreground">Causa: </span>{cause ? label(cause) : 'sin causa registrada'}</p>
          <p><span className="text-muted-foreground">Efecto: </span>{effects.length ? effects.map(label).join(' · ') : 'sin efectos todavía'}</p>
        </section>
      )}
    </div>
  )
}

const laneTone = (e: KratosEvent) =>
  e.type.includes('blocked') ? 'bg-error' : e.type.startsWith('decision') ? 'bg-warning' : e.type === 'run.finished' || e.type === 'artifact.created' ? 'bg-success' : e.type.startsWith('run') ? 'bg-info' : 'bg-neutral'
