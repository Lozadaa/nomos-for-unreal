import { useEffect, useMemo, useRef, useState } from 'react'
import { humanError } from '@/lib/errors'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router'
import { api } from '@/api'
import { EmptyState } from '@/components/EmptyState'
import { StatusDot } from '@/components/StatusDot'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { animateUpdate, withViewTransition } from '@/feel/transitions'
import { useAction } from '@/feel/useAction'
import { useAfter } from '@/hooks/time'
import { useResource } from '@/hooks/useResource'
import { providerLabel, type Decision } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { patchTask, useStore } from '@/store'

const typing = (el: Element | null) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement

export function Decisiones() {
  const { data, loading, reload, mutate } = useResource<Decision[]>('/decisions', /^decision\./)
  const tasks = useStore((s) => s.tasks)
  const navigate = useNavigate()
  const slow = useAfter(loading)
  const [selected, setSelected] = useState<string | null>(null)
  const chosen = useRef('')
  const [justChosen, setJustChosen] = useState<string | null>(null)

  const list = useMemo(() => [...(data ?? [])].sort((a, b) => Number(b.state === 'open') - Number(a.state === 'open') || a.createdAt.localeCompare(b.createdAt)), [data])
  const open = list.filter((d) => d.state === 'open')
  const current = list.find((d) => d.id === selected) ?? open[0] ?? list[0]
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
        setJustChosen(chosen.current)
        return () => { undoList(); undoTask(); setJustChosen(null) }
      },
      reload: () => { setJustChosen(null); reload() },
    },
  )
  const choose = (optionId: string) => { chosen.current = optionId; void resolve.fire() }
  const select = (id: string) => { setSelected(id); setJustChosen(null) }

  if (loading) return slow ? <div role="status" aria-label="Cargando las decisiones" className="flex flex-col gap-2">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div> : null
  if (!list.length) {
    return <EmptyState title="No tienes decisiones pendientes" hint="Cuando Kratos necesite tu criterio, aparecerá aquí." action={{ label: 'Ver producción', onClick: () => void withViewTransition(() => navigate('/', { flushSync: true })) }} />
  }

  const option = current?.options.find((o) => o.id === (justChosen ?? current.chosenOptionId))
  const owner = providerLabel[task?.assigneeProvider ?? ''] ?? 'Kratos'
  const successor = current && current.state === 'stale' ? open.find((d) => d.taskId === current.taskId) : undefined

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm text-muted-foreground" role="status">
        {open.length === 0 ? 'No tienes decisiones pendientes' : open.length === 1 ? 'Tienes 1 decisión pendiente' : `Tienes ${open.length} decisiones pendientes`}
      </h2>
      <div className="grid grid-cols-[360px_minmax(0,1fr)] gap-6">
        <ul aria-label="Bandeja de decisiones" className="flex flex-col overflow-hidden rounded-lg border border-subtle">
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
                  <span className="flex items-center gap-2"><StatusDot tone={d.state === 'open' ? 'warning' : d.state === 'resolved' ? 'success' : 'neutral'} /><span className="truncate font-medium">{d.reason}</span></span>
                  <span className="truncate pl-4 text-xs text-muted-foreground">{t?.title ?? d.taskId}{d.state === 'resolved' ? ' · resuelta' : d.state === 'stale' ? ' · caducada' : ''}</span>
                </button>
              </li>
            )
          })}
        </ul>

        {current && (
          <section aria-label="Decisión" className={cn('flex flex-col gap-4 rounded-lg border border-subtle p-6', current.state === 'stale' && 'opacity-70')}>
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold">{current.reason}</h3>
              {task && <p className="text-sm text-muted-foreground">En la tarea «{task.title}»</p>}
            </div>
            {current.evidence.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {current.evidence.map((e) => <li key={`${e.kind}${e.ref}`}><span className="font-mono">{e.kind}</span> · {e.ref}</li>)}
              </ul>
            )}
            {current.state === 'open' && (
              <>
                <div role="group" aria-label="Opciones" className="flex flex-wrap gap-2">
                  {current.options.map((o) => (
                    <div key={o.id} className="flex flex-col items-start gap-1">
                      <Button variant={justChosen === o.id ? 'default' : 'outline'} aria-pressed={justChosen === o.id} disabled={resolve.pending} onClick={() => choose(o.id)}>{o.label}</Button>
                      {o.description && <span className="max-w-48 text-xs text-muted-foreground">{o.description}</span>}
                    </div>
                  ))}
                </div>
                {resolve.pending && <p className="text-xs text-muted-foreground" role="status">Registrando tu elección…</p>}
                {resolve.error && !resolve.pending && <p role="alert" className="text-xs text-error">No se registró la elección. {humanError(resolve.error)}</p>}
              </>
            )}
            {current.state === 'resolved' && (
              <p role="status" className="text-sm">Elegiste {option?.label ?? 'una opción'}. {owner} continúa.</p>
            )}
            {current.state === 'stale' && (
              <div className="flex flex-col items-start gap-2">
                <p role="status" className="text-sm">Esta decisión caducó porque cambió el contexto. Kratos la prepara de nuevo.</p>
                {successor && <Button variant="outline" size="sm" onClick={() => void animateUpdate(() => flushSync(() => select(successor.id)))}>Ver la nueva</Button>}
              </div>
            )}
          </section>
        )}
      </div>
      <p className="text-xs text-muted-foreground"><kbd className="font-mono">j</kbd> / <kbd className="font-mono">k</kbd> para moverte por la bandeja</p>
    </div>
  )
}
