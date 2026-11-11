import { useEffect, useMemo, useRef, useState } from 'react'
import { humanError } from '@/lib/errors'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router'
import { api } from '@/api'
import { DecisionDetails, DecisionOptions, decisionText, repeatText } from '@/components/DecisionOptions'
import { EmptyState as VisualEmpty } from '@/visual/art/EmptyState'
import { StatusDot } from '@/components/StatusDot'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { animateUpdate, withViewTransition } from '@/feel/transitions'
import { useAction } from '@/feel/useAction'
import { useAfter } from '@/hooks/time'
import { useResource } from '@/hooks/useResource'
import { providerLabel, shortId, type Decision } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { patchTask, useStore } from '@/store'
import { truncateWords } from '@/visual/text-budget'
import { BRAND } from '@/lib/brand'

const typing = (el: Element | null) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement

export function Decisiones() {
  const { data, loading, reload, mutate } = useResource<Decision[]>('/decisions', /^decision\./)
  const tasks = useStore((s) => s.tasks)
  const navigate = useNavigate()
  const slow = useAfter(loading)
  const [selected, setSelected] = useState<string | null>(null)
  const chosen = useRef('')
  const [chosenNow, setChosenNow] = useState<{ decisionId: string; optionId: string } | null>(null)

  const list = useMemo(() => [...(data ?? [])].sort((a, b) => Number(b.state === 'open') - Number(a.state === 'open') || a.createdAt.localeCompare(b.createdAt)), [data])
  const open = list.filter((d) => d.state === 'open')
  const current = list.find((d) => d.id === selected) ?? open[0] ?? list[0]
  const justChosen = chosenNow && chosenNow.decisionId === current?.id ? chosenNow.optionId : null
  const task = tasks.find((t) => t.id === current?.taskId)

  // j / k recorren la bandeja; sin animación (se usan decenas de veces al día)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'j' && e.key !== 'k') || e.metaKey || e.ctrlKey || e.altKey || typing(document.activeElement)) return
      const i = list.findIndex((d) => d.id === current?.id)
      const next = list[Math.min(list.length - 1, Math.max(0, i + (e.key === 'j' ? 1 : -1)))]
      if (next) { setSelected(next.id); e.preventDefault() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [list, current?.id])

  const resolve = useAction(
    () => api(`/decisions/${encodeURIComponent(current!.id)}/resolve`, { method: 'POST', body: { optionId: chosen.current, by: 'director' } }),
    {
      // la opción elegida se resalta y la decisión sale de «pendientes» en el acto; si el servidor la rechaza, todo vuelve
      optimistic: () => {
        const decision = current!
        const undoList = mutate((all) => all.map((d) => (d.id === decision.id ? { ...d, state: 'resolved', chosenOptionId: chosen.current } : d)))
        const undoTask = task ? patchTask(task.id, { decisionId: null, blockedReason: task.blockedReason === decision.reason ? null : task.blockedReason }) : () => {}
        setSelected(decision.id) // la vista se queda en esta decisión aunque deje de estar «pendiente»
        setChosenNow({ decisionId: decision.id, optionId: chosen.current })
        return () => { undoList(); undoTask(); setChosenNow(null) }
      },
      reload: () => { setChosenNow(null); reload() },
    },
  )
  const choose = (optionId: string) => { chosen.current = optionId; void resolve.fire() }
  const select = (id: string) => setSelected(id)

  if (loading) return slow ? <div role="status" aria-label="Loading decisions" className="flex flex-col gap-2">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div> : null
  if (!list.length) {
    return <VisualEmpty view="decisiones" message="No decisions waiting on you" action={{ label: 'Go to Production', onClick: () => void withViewTransition(() => navigate('/', { flushSync: true })) }} />
  }

  const option = current?.options.find((o) => o.id === (justChosen ?? current.chosenOptionId))
  const owner = providerLabel[task?.assigneeProvider ?? ''] ?? BRAND.short
  const successor = current && current.state === 'stale' ? open.find((d) => d.taskId === current.taskId) : undefined

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm text-muted-foreground" role="status">
        {open.length === 0 ? 'No decisions waiting on you' : open.length === 1 ? '1 decision waiting on you' : `${open.length} decisions waiting on you`}
      </h2>
      <div className="grid grid-cols-[360px_minmax(0,var(--k-prose))] gap-6">
        <ul aria-label="Decision inbox" className="flex flex-col overflow-hidden rounded-lg border border-subtle">
          {list.map((d) => {
            const t = tasks.find((x) => x.id === d.taskId)
            const active = d.id === current?.id
            return (
              <li key={d.id}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => select(d.id)}
                  className={cn('flex w-full flex-col gap-1 border-b border-subtle px-4 py-3 text-left text-sm transition-colors duration-(--k-dur-micro) last:border-b-0 hover:bg-card', active && 'bg-card', d.state !== 'open' && 'text-muted-foreground')}
                >
                  <span className="flex items-center gap-2"><StatusDot tone={d.state === 'open' ? 'warning' : d.state === 'resolved' ? 'success' : 'neutral'} /><span title={d.reason} className="truncate font-medium">{d.reason}</span></span>
                  <span title={t?.title ?? d.taskId} className="truncate pl-4 text-xs text-muted-foreground">{t?.title ?? d.taskId}{d.state === 'resolved' ? ' · resolved' : d.state === 'stale' ? ' · expired' : ''}</span>
                </button>
              </li>
            )
          })}
        </ul>

        {current && (
          <section aria-label="Decision" data-decision-card className={cn('flex flex-col gap-4 rounded-lg border border-subtle p-6', current.state === 'stale' && 'opacity-70')}>
            <div className="flex flex-col gap-1">
              <h3 aria-label={current.reason} title={current.reason} className="text-lg font-semibold">{decisionText(current).reason}</h3>
              <div className="flex items-center gap-3">
                <span title={task?.title ?? current.taskId} aria-label={`Task: ${task?.title ?? current.taskId}`} className="font-mono text-xs text-muted-foreground">{shortId(current.taskId)}</span>
                {repeatText(current) && <span className="text-xs text-muted-foreground">{repeatText(current)}</span>}
                <DecisionDetails decision={current} taskTitle={task?.title} />
              </div>
            </div>
            {current.state === 'open' && (
              <>
                <DecisionOptions decision={current} area={task?.area} selected={justChosen} disabled={resolve.pending} onChoose={choose} />
                {resolve.pending && <p className="text-xs text-muted-foreground" role="status">Saving your choice…</p>}
                {resolve.error && !resolve.pending && <p role="alert" className="text-xs text-error">Your choice wasn't saved. {humanError(resolve.error)}</p>}
              </>
            )}
            {current.state === 'resolved' && (
              <p role="status" aria-label={`You chose ${option?.label ?? 'an option'}. ${owner} continues.`} title={`You chose ${option?.label ?? 'an option'}. ${owner} continues.`} className="text-sm">You chose {truncateWords(option?.label ?? 'an option', decisionText(current).optionLimit)}. {owner} continues.</p>
            )}
            {current.state === 'stale' && (
              <div className="flex flex-col items-start gap-2">
                <p role="status" className="text-sm">This decision expired because the context changed. {BRAND.short} is preparing a new one.</p>
                {successor && <Button variant="outline" size="sm" onClick={() => void animateUpdate(() => flushSync(() => select(successor.id)))}>See the new one</Button>}
              </div>
            )}
          </section>
        )}
      </div>
      <p className="text-xs text-muted-foreground" title="j / k to move through the inbox"><kbd className="font-mono">j</kbd> / <kbd className="font-mono">k</kbd></p>
    </div>
  )
}
