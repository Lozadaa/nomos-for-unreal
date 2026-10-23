import { memo, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { EmptyState } from '@/visual/art/EmptyState'
import { animateUpdate, withViewTransition } from '@/feel/transitions'
import { useFresh } from '@/hooks/fresh'
import { useParam } from '@/hooks/useParam'
import { useRuns } from '@/hooks/useRuns'
import { eventPresentation, eventText, hourlyActivity, laneOf, lanes, placeEvents } from '@/lib/events'
import type { KratosEvent } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { Glyph } from '@/visual/Glyph'
import type { PresentationKind } from '@/visual/glyphs'
import { Sparkline } from '@/visual/art/Sparkline'

const clock = (iso: number | string) => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
const TEN_MIN = 10 * 60_000
const rangeTime = (time: number) => new Date(time).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Eje estable: el final sube de diez en diez minutos, así una entrada nueva no mueve el resto de golpe. */
export function axis(times: number[]): [number, number] {
  // el inicio también sube de diez en diez minutos hacia abajo: descartar el evento más antiguo no desplaza los demás
  const min = Math.floor(Math.min(...times) / TEN_MIN) * TEN_MIN
  const max = Math.ceil((Math.max(...times) + 1) / TEN_MIN) * TEN_MIN
  return [min, Math.max(max, min + TEN_MIN)]
}

export function Actividad() {
  const events = useStore((s) => s.events)
  const tasks = useStore((s) => s.tasks)
  const gaps = useStore((s) => s.gaps)
  const runs = useRuns()
  const providers = useMemo(() => new Map(runs.map((run) => [run.id, run.provider])), [runs])
  const [taskId, setTaskId] = useParam('tarea')
  const fresh = useFresh(events.map((e) => e.seq))
  const [selected, setSelected] = useState<number | null>(null)
  const navigate = useNavigate()

  const titles = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks])
  const titleOf = (id: unknown) => titles.get(id as string)
  const visible = useMemo(() => events.filter((e) => !taskId || e.payload.taskId === taskId), [events, taskId])
  const [min, max] = useMemo(() => axis(visible.length ? visible.map((e) => Date.parse(e.createdAt)) : [Date.now()]), [visible])
  const num = (t: number | string) => (((typeof t === 'string' ? Date.parse(t) : t) - min) / (max - min)) * 100
  const pct = (t: number | string) => `${num(t)}%`
  const byLane = useMemo(() => {
    const grouped = new Map(lanes.map((lane) => [lane, [] as KratosEvent[]]))
    for (const event of visible) grouped.get(laneOf(event, providers))!.push(event)
    return lanes.map((lane) => {
      const items = grouped.get(lane)!
      const placements = placeEvents(items.map((event) => ((Date.parse(event.createdAt) - min) / (max - min)) * 100))
      return { lane, items, placements, tall: placements.some((item) => item.track > 0) }
    })
  }, [visible, providers, min, max])
  const hourly = useMemo(() => hourlyActivity(visible, providers), [visible, providers])
  const detail = visible.find((e) => e.seq === selected)

  const label = (e: KratosEvent) => `${eventText(e, providers)}${titleOf(e.payload.taskId) ? ` · ${titleOf(e.payload.taskId)}` : ''}`
  const cause = detail ? events.find((e) => e.id === detail.payload.correlation) : undefined
  const effects = detail ? events.filter((e) => e.payload.correlation === detail.id) : []
  const filter = (id: string) => void animateUpdate(() => { setSelected(null); return setTaskId(id) })

  if (events.length === 0) {
    return <EmptyState view="actividad" action={{ label: 'Nueva petición', onClick: () => void withViewTransition(() => navigate('/?nueva=1', { flushSync: true })) }} />
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
        <div className="rounded-lg border border-subtle"><EmptyState view="actividad" message="Ningún evento coincide con el filtro" action={{ label: 'Quitar filtro', onClick: () => filter('') }} /></div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_240px] items-start gap-4">
        <section aria-label="Actividad por carriles" className="min-w-0 rounded-lg border border-subtle">
          {byLane.map(({ lane, items, placements, tall }) => (
            <div key={lane} role="group" aria-label={lane} className="grid grid-cols-[140px_minmax(0,1fr)] border-b border-subtle last:border-b-0">
              <h2 className="flex items-center px-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">{lane}</h2>
              <div className={cn('relative mx-4 [container-type:inline-size]', tall ? 'h-16' : 'h-11')}>
                {gaps.map((g) => (
                  <span key={g.from} aria-hidden title={`Sin datos de ${clock(g.from)} a ${clock(g.to)} · servicio desconectado`}
                    className="absolute inset-y-1 border-x border-dashed border-subtle bg-card" style={{ left: pct(g.from), width: `calc(${pct(g.to)} - ${pct(g.from)})` }} />
                ))}
                {items.map((e, index) => {
                  const glyph = eventPresentation(e, providers)
                  return <Dot key={e.seq} e={e} kind={glyph.kind} value={glyph.value} track={placements[index].track} compact={placements[index].compact} p={num(e.createdAt)} text={label(e)} selected={selected === e.seq} isFresh={fresh(e.seq)} onSelect={setSelected} />
                })}
              </div>
            </div>
          ))}
        </section>
        <section aria-label="Actividad por hora" className="flex flex-col gap-3 rounded-lg border border-subtle p-3">
          <h2 className="text-xs font-medium">Actividad por hora</h2>
          <p className="text-xs text-muted-foreground">24 h · {rangeTime(hourly.start)} – {rangeTime(hourly.end)}</p>
          <div className="grid gap-3 [&_figure>div]:grid-cols-[96px_minmax(0,1fr)]">
            {hourly.lanes.map((lane) => <Sparkline key={lane.label} title={`Actividad por hora: ${lane.label}`} lanes={[lane]} hideTitle />)}
          </div>
          <p className="text-xs text-muted-foreground" title={`${events.length >= 500 ? 'Ventana de 500 eventos recibidos; puede faltar actividad anterior.' : 'Solo eventos recibidos; los ceros no garantizan cobertura.'}${gaps.length > 0 ? ' Hay intervalos sin datos por desconexión.' : ''}`}>{visible.length} eventos{gaps.length > 0 ? ` · ${gaps.length} huecos` : ''}</p>
        </section>
        </div>
      )}

      {detail && (
        <section aria-label="Evento seleccionado" className="flex flex-col gap-2 rounded-lg border border-subtle bg-card p-4 text-sm">
          <h3 className="font-medium">{label(detail)}</h3>
          <p className="text-muted-foreground">{clock(detail.createdAt)} · {laneOf(detail, providers)}</p>
          <p><span className="text-muted-foreground">Causa: </span>{cause ? label(cause) : 'sin causa registrada'}</p>
          <p><span className="text-muted-foreground">Efecto: </span>{effects.length ? effects.map(label).join(' · ') : 'sin efectos todavía'}</p>
        </section>
      )}
    </div>
  )
}

/** Un evento del carril. Memoizado: un evento nuevo no vuelve a pintar los 500 anteriores salvo que el eje los desplace. */
const Dot = memo(function Dot({ e, kind, value, track, compact, p, text, selected, isFresh, onSelect }: { e: KratosEvent; kind: PresentationKind; value: string; track: number; compact: boolean; p: number; text: string; selected: boolean; isFresh: boolean; onSelect: (seq: number) => void }) {
  return (
    <button
      type="button"
      aria-label={text}
      aria-pressed={selected}
      data-track={track}
      onClick={() => onSelect(e.seq)}
      style={{ '--p': p, '--anchor': p > 92 ? '100%' : p < 8 ? '0%' : '50%', top: `${[50, 17, 83][track]}%` } as React.CSSProperties}
      className={cn('group absolute left-0 flex h-5 min-w-5 items-center justify-center transition-transform duration-(--k-dur-reorder) ease-k outline-offset-2 hover:z-20 focus-visible:z-20 [transform:translate(calc(var(--p)*1cqw_-_var(--anchor)),-50%)]', selected && 'z-20', isFresh && 'animate-in fade-in motion-reduce:animate-none')}
    >
      {compact && <span data-dense-marker aria-hidden className="size-1.5 rounded-full bg-neutral group-hover:hidden group-focus-visible:hidden group-aria-pressed:hidden" />}
      <span className={cn('items-center justify-center transition-transform duration-(--k-dur-micro) group-hover:scale-125 group-aria-pressed:ring-2 group-aria-pressed:ring-foreground/40', compact ? 'hidden group-hover:inline-flex group-focus-visible:inline-flex group-aria-pressed:inline-flex' : 'inline-flex')}><Glyph kind={kind} value={value} size={14} /></span>
      <span role="tooltip" className="pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max max-w-72 rounded-md border border-subtle bg-popover px-2 py-1 text-xs text-popover-foreground group-hover:block group-focus-visible:block">{text}</span>
    </button>
  )
})
