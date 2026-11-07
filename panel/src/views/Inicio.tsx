import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { CheckCircle2, ChevronRight, MessageCircle } from 'lucide-react'
import { StatusDot } from '@/components/StatusDot'
import { useAssetViewer } from '@/components/AssetViewer'
import { withViewTransition } from '@/feel/transitions'
import { useAuthedSrc } from '@/hooks/artifact'
import { useResource } from '@/hooks/useResource'
import type { ApprovalItem, Approvals } from '@/lib/approvals'
import { BRAND } from '@/lib/brand'
import { relativeTime } from '@/lib/time'
import type { Decision, Stage, Task, Tone } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { AreaPictogram } from '@/visual/art/AreaPictogram'
import { ApprovalCard } from './ApprovalCard'
import { Chat } from './Chat'
import { DecisionCard } from './DecisionCard'
import { viewerItems } from './PorAprobar'
import { useLatestCaptures } from './Produccion'
import { TaskSheet } from './TaskSheet'

const active: Stage[] = ['preparada', 'implementando', 'revisando', 'probando', 'integrando', 'cerrando']
const doing: Record<Stage, string> = {
  pendiente: 'En cola', preparada: 'A punto de empezar', implementando: 'Construyéndolo', revisando: 'Comprobando que esté bien',
  probando: 'Probándolo en el juego', integrando: 'Metiéndolo en el juego', cerrando: 'Rematando', done: 'Terminado',
}

/** Una frase en lenguaje de persona: qué le pasa a la tarea ahora. Los motivos técnicos se ven al abrirla. */
export function humanStatus(t: Task, asking: boolean): { text: string; tone: Tone } {
  if (t.failure || (t.blockedReason && t.state !== 'cerrando')) return { text: 'Se ha atascado', tone: 'error' }
  if (t.blockedReason) return { text: 'No se pudo rematar', tone: 'warning' }
  if (asking) return { text: 'Tiene una pregunta', tone: 'warning' }
  return { text: doing[t.state], tone: t.state === 'done' ? 'success' : t.state === 'preparada' ? 'neutral' : 'info' }
}

/** La pregunta de una decisión dicha como la diría una persona; las que no se reconocen quedan tal cual. */
export function humanQuestion(reason: string): string {
  if (/^Tarea parada en «/.test(reason)) return 'Se ha quedado parada. ¿La retomo o la cancelo?'
  if (/^Lista para integrar/.test(reason)) return 'Ya está lista. ¿La meto en el juego?'
  if (/NOMOS_DONE/.test(reason)) return 'Paró sin avisar de que había terminado. ¿Miro qué pasó?'
  return reason
}

const plural =(n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** La imagen de la tarea: su última captura o, sin captura, el pictograma de su área. */
function Cover({ path, task, className }: { path?: string; task: Task; className?: string }) {
  const src = useAuthedSrc(path ?? null)
  // sin imagen, en móvil el hueco es más bajo: un pictograma no merece media pantalla
  return <div className={cn('flex w-full items-center justify-center overflow-hidden bg-card', src ? 'aspect-video' : 'aspect-[3/1] sm:aspect-video', className)}>
    {src ? <img src={src} alt={`Última imagen de ${task.title}`} loading="lazy" className="size-full object-cover" /> : <AreaPictogram area={task.area} size={40} />}
  </div>
}

function TaskCard({ task, thumb, asking, onOpen, small = false }: { task: Task; thumb?: string; asking: boolean; onOpen: (t: Task) => void; small?: boolean }) {
  const status = humanStatus(task, asking)
  return <li>
    <button type="button" data-task-id={task.id} onClick={() => onOpen(task)} aria-label={`${task.title}, ${status.text}`}
      className="group flex w-full flex-col overflow-hidden rounded-xl border border-subtle text-left transition-colors duration-(--k-dur-micro) hover:border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <Cover path={thumb} task={task} className="transition-transform duration-(--k-dur-standard) group-hover:scale-[1.02] motion-reduce:transition-none" />
      <span className={cn('flex flex-col gap-1 border-t border-subtle bg-background', small ? 'px-3 py-2.5' : 'px-4 py-3')}>
        <span className={cn('truncate font-medium', small ? 'text-sm' : 'text-base')}>{task.title}</span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground"><StatusDot tone={status.tone} pulse={status.tone === 'info'} />{small ? relativeTime(task.updatedAt) : status.text}</span>
      </span>
    </button>
  </li>
}

function Section({ title, count, children, className }: { title: string; count?: number; children: React.ReactNode; className?: string }) {
  return <section aria-label={title} className={cn('flex flex-col gap-4', className)}>
    <h2 className="flex items-baseline gap-2 text-lg font-semibold tracking-tight">{title}{!!count && <span className="text-sm font-normal text-muted-foreground">{count}</span>}</h2>
    {children}
  </section>
}

/**
 * La página única: lo que necesita tu decisión, lo que se hace ahora, lo terminado y el chat con el director.
 * Lo técnico (diffs, registros, pruebas) está al abrir una tarjeta; el resto de vistas, en «Más».
 */
export function Inicio() {
  const tasks = useStore((s) => s.tasks)
  const loaded = useStore((s) => s.loaded)
  const waiting = useStore((s) => s.waiting)
  const thumbs = useLatestCaptures()
  const decisions = useResource<Decision[]>('/decisions', /^decision\./)
  const approvals = useResource<Approvals>('/approvals', /^approval\.|^artifact\./)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const openId = params.get('tarea')

  // lo aprobado en esta visita se queda a la vista con su nuevo estado; lo de antes no aparece
  const seen = useRef(new Set<string>())
  const approvalItems = (approvals.data?.items ?? []).filter((i) => {
    if (i.state === 'pending') seen.current.add(i.id)
    return seen.current.has(i.id)
  })
  const { open: openViewer, viewer } = useAssetViewer(viewerItems(approvalItems))
  const patch = (id: string) => (change: Partial<ApprovalItem>) => approvals.mutate((all) => {
    const items = all.items.map((i) => (i.id === id ? { ...i, ...change } : i))
    return { ...all, items, pending: items.filter((i) => i.state === 'pending').length }
  })
  const openDecisions = (decisions.data ?? []).filter((d) => d.state === 'open' && tasks.some((t) => t.id === d.taskId))
  const held = new Set([...approvalItems.filter((i) => i.state === 'pending').map((i) => i.taskId), ...openDecisions.map((d) => d.taskId)])

  const byRecent = (a: Task, b: Task) => b.updatedAt.localeCompare(a.updatedAt)
  const now = tasks.filter((t) => active.includes(t.state) && !held.has(t.id) && !t.id.startsWith('tmp-')).sort(byRecent)
  const queued = tasks.filter((t) => t.state === 'pendiente').sort(byRecent)
  const done = tasks.filter((t) => t.state === 'done').sort(byRecent)
  const needs = openDecisions.length + approvalItems.filter((i) => i.state === 'pending').length

  const withTask = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('tarea', id); else next.delete('tarea')
    next.delete('nueva')
    const query = next.toString()
    return query ? `/?${query}` : '/'
  }
  const [allDecisions, setAllDecisions] = useState(false)
  const openTask = (t: Task) => void withViewTransition(() => navigate(withTask(t.id), { flushSync: true }))
  const closeTask = async () => {
    const id = openId
    await withViewTransition(() => navigate(withTask(null), { flushSync: true }))
    document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id ?? '')}"]`)?.focus()
  }

  const headline = !loaded ? ' ' : needs ? `${plural(needs, 'cosa espera', 'cosas esperan')} tu decisión` : now.length ? 'Todo avanza; no hace falta nada de ti' : `${BRAND.short} está libre: pídele algo`
  const summary = [now.length && plural(now.length, 'en marcha', 'en marcha'), queued.length && plural(queued.length, 'en cola', 'en cola'), done.length && plural(done.length, 'terminada', 'terminadas')].filter(Boolean).join(' · ')

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
      <div className="flex min-w-0 flex-col gap-10">
        <header className="flex flex-col gap-1 pt-1">
          <h2 role="status" className="text-2xl font-semibold tracking-tight sm:text-3xl">{headline}</h2>
          {summary && <p className="text-muted-foreground">{summary}</p>}
          {/* en móvil el chat queda al final: un atajo lleva hasta él */}
          <a href="#chat" onClick={(e) => { e.preventDefault(); document.getElementById('chat')?.scrollIntoView({ block: 'start' }); document.querySelector<HTMLTextAreaElement>('#chat textarea')?.focus({ preventScroll: true }) }}
            className="mt-3 inline-flex h-11 items-center gap-2 self-start rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground lg:hidden">
            <MessageCircle className="size-5" aria-hidden />Habla con {BRAND.short}
          </a>
        </header>

        {needs > 0 && <Section title="Necesita tu decisión">
          <div className="flex flex-col gap-4">
            {approvalItems.map((item) => <ApprovalCard key={item.id} compact item={item} open={openViewer} patch={patch(item.id)} />)}
            {openDecisions.slice(0, allDecisions ? undefined : 3).map((d) => {
              const task = tasks.find((t) => t.id === d.taskId)!
              const thumb = thumbs.get(task.id)
              return <article key={d.id} aria-label={task.title} className={cn('grid gap-5 rounded-xl border border-warning/40 p-4 sm:p-5', thumb && 'sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]')}>
                {thumb && <button type="button" onClick={() => openTask(task)} className="overflow-hidden rounded-lg" aria-label={`Ver ${task.title}`}>
                  <Cover path={thumb} task={task} className="rounded-lg" />
                </button>}
                <DecisionCard bare decision={d} task={task} onStale={decisions.reload} heading={<span className="flex flex-col gap-1">
                  <span className="flex items-center gap-2 text-lg font-semibold">{!thumb && <AreaPictogram area={task.area} size={22} />}{task.title}</span>
                  <span className="font-normal text-muted-foreground">{humanQuestion(d.reason)}</span>
                </span>} />
              </article>
            })}
            {openDecisions.length > 3 && !allDecisions && <button type="button" onClick={() => setAllDecisions(true)} className="self-start rounded-md border border-subtle px-4 py-2 text-sm hover:border-strong">Ver {openDecisions.length - 3} más</button>}
          </div>
        </Section>}

        <Section title="Ahora mismo" count={now.length}>
          <div data-tour-anchor="map">
            {now.length ? <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {now.map((t) => <TaskCard key={t.id} task={t} thumb={thumbs.get(t.id)} asking={!!waiting[t.id]} onOpen={openTask} />)}
            </ul> : <p className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="size-5" aria-hidden />{loaded ? 'Nada en marcha ahora mismo.' : 'Cargando…'}</p>}
          </div>
        </Section>

        {done.length > 0 && <Section title="Terminado" count={done.length}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {done.slice(0, 8).map((t) => <TaskCard key={t.id} small task={t} thumb={thumbs.get(t.id)} asking={false} onOpen={openTask} />)}
          </ul>
        </Section>}

        {queued.length > 0 && <details className="group rounded-xl border border-subtle">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
            En cola<span className="font-normal text-muted-foreground">{queued.length}</span>
          </summary>
          <ul className="flex flex-col border-t border-subtle">
            {queued.map((t) => <li key={t.id}><button type="button" data-task-id={t.id} onClick={() => openTask(t)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-card"><AreaPictogram area={t.area} size={18} />{t.title}</button></li>)}
          </ul>
        </details>}
      </div>

      <aside id="chat" aria-label={`Habla con ${BRAND.short}`} data-tour-anchor="composer"
        className="flex h-[75dvh] min-h-[28rem] flex-col gap-3 rounded-xl border border-subtle p-4 lg:sticky lg:top-5 lg:h-[calc(100dvh-var(--k-header)-2.5rem)]">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Habla con {BRAND.short}</h2>
          <p className="text-sm text-muted-foreground">Pide cambios o cosas nuevas con tus palabras.</p>
        </div>
        <Chat className="h-auto min-h-0 max-w-none flex-1" autoFocus={params.get('nueva') === '1'} />
      </aside>

      {openId && <TaskSheet id={openId} task={tasks.find((t) => t.id === openId)} onClose={closeTask} />}
      {viewer}
    </div>
  )
}
