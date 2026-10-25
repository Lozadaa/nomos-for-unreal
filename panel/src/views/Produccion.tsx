import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Composer } from '@/components/Composer'
import { RowsSkeleton } from '@/components/Skeletons'
import { TaskRow } from '@/components/TaskRow'
import { animateUpdate, withViewTransition } from '@/feel/transitions'
import { useAfter, useNow } from '@/hooks/time'
import { useParam } from '@/hooks/useParam'
import { useResource } from '@/hooks/useResource'
import { useRuns } from '@/hooks/useRuns'
import { stageLabel, stages, type Artifact, type Stage, type Task } from '@/lib/tasks'
import { useStore } from '@/store'
import { TaskSheet } from './TaskSheet'
import { ClosingNote } from './Closing'
import { assignAgentNames } from '@/visual/art/agentName'
import { ProductionMap } from '@/visual/art/ProductionMap'
import { EmptyState } from '@/visual/art/EmptyState'
import { LastBuildLine } from '@/shell/PlayButton'
import { usePlay } from '@/shell/usePlay'

type Filter = 'todas' | Stage

/** La última captura (o fotograma de vídeo) de cada tarea, para la miniatura de su fila. */
function useLatestCaptures(): Map<string, string> {
  const { data } = useResource<Artifact[]>('/artifacts', /^artifact\./)
  return useMemo(() => {
    const latest = new Map<string, Artifact>()
    for (const a of Array.isArray(data) ? data : []) {
      if (a.kind !== 'screenshot' && !(a.kind === 'video' && a.previewPath)) continue
      if ((latest.get(a.taskId)?.createdAt ?? '') < a.createdAt) latest.set(a.taskId, a)
    }
    return new Map([...latest].map(([task, a]) => [task, `/artifacts/${encodeURIComponent(a.id)}/${a.kind === 'video' ? 'preview' : 'file'}`]))
  }, [data])
}

export function Produccion() {
  const tasks = useStore((s) => s.tasks)
  const runs = useRuns()
  const thumbs = useLatestCaptures()
  const byTask = useMemo(() => {
    const map = new Map<string, (typeof runs)[number]>()
    for (const run of [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))) {
      if (map.get(run.taskId)?.state !== 'running' || run.state === 'running') map.set(run.taskId, run)
    }
    return map
  }, [runs])
  const agentsByRunId = useMemo(() => new Map(assignAgentNames([...runs]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
    .map((run) => ({ ...run, area: tasks.find((t) => t.id === run.taskId)?.area, state: run.state === 'running' ? run.waiting ? 'waiting' : 'running' : 'idle' })))
    .map((agent) => [agent.id, { name: agent.name, ordinal: agent.ordinal }])), [runs, tasks])
  const loaded = useStore((s) => s.loaded)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const openId = params.get('tarea')
  const [filterParam, setFilter] = useParam('etapa', 'todas')
  const filter = filterParam as Filter
  const [query, setQuery] = useState('')
  const now = useNow()
  const play = usePlay()
  const showSkeleton = useAfter(!loaded)
  const opener = useRef<HTMLElement | null>(null)

  const q = query.trim().toLowerCase()
  const matches = (t: Task) =>
    (filter === 'todas' || t.state === filter) &&
    (!q || `${t.title} ${t.id} ${t.assigneeProvider ?? ''} ${t.assigneeRole ?? ''}`.toLowerCase().includes(q))

  const groups = useMemo(() => stages
    .map((stage) => ({ stage, rows: tasks.filter((t) => t.state === stage && matches(t)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }))
    .filter((g) => g.rows.length), [tasks, filter, q]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (to: string) => withViewTransition(() => navigate(to, { flushSync: true }))
  const rowOf = (id: string | null) => document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id ?? '')}"]`)
  // abrir y cerrar el detalle solo tocan ?tarea: el resto de parámetros (etapa, nueva…) se conserva
  const withTask = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('tarea', id); else next.delete('tarea')
    const query = next.toString()
    return query ? `/?${query}` : '/'
  }
  const open = (task: Task, from: HTMLElement) => { opener.current = from; void go(withTask(task.id)) }
  const close = async () => {
    const id = openId
    await go(withTask(null))
    // el diálogo se desmonta dentro de la transición: el foco vuelve a la fila que lo abrió
    const from = opener.current?.isConnected ? opener.current : rowOf(id)
    from?.focus()
  }
  const clearFilters = () => void animateUpdate(() => { setQuery(''); return setFilter('todas') })

  const filtering = filter !== 'todas' || q !== ''
  const openTask = openId ? tasks.find((t) => t.id === openId) : undefined

  return (
    <div className="flex flex-col gap-6">
      <Composer autoFocus={params.get('nueva') === '1'} isVisible={matches} onHidden={clearFilters} />

      <LastBuildLine {...play} />

      {loaded && <figure data-tour="mapa" data-tour-anchor="map" className="rounded-lg border border-subtle px-4 pb-3">
        <ProductionMap tasks={tasks} selected={filter === 'todas' ? undefined : filter}
          onSelect={(stage) => void animateUpdate(() => setFilter(filter === stage ? 'todas' : stage))}
          onKeyboardSelect={(stage) => void withViewTransition(() => setFilter(filter === stage ? 'todas' : stage), { animate: false })} />
        <figcaption className="grid grid-cols-8 text-center text-xs text-muted-foreground">
          {stages.map((stage) => <span key={stage} className={filter === stage ? 'font-medium text-foreground' : undefined}>{stageLabel[stage]}</span>)}
        </figcaption>
      </figure>}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" aria-pressed={filter === 'todas'} onClick={() => void animateUpdate(() => setFilter('todas'))}>Todas</Button>
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar tarea…" autoComplete="off" name="q" spellCheck={false}
          aria-label="Buscar tarea"
          className="ml-auto h-8 w-56"
        />
      </div>

      <section aria-label="Producción" className="overflow-hidden rounded-lg border border-subtle">
        {!loaded ? (showSkeleton ? <RowsSkeleton /> : <div className="h-48" />)
          : groups.length === 0 ? (
            <EmptyState view="produccion" message={filtering ? 'Ninguna tarea coincide con el filtro' : undefined}
              action={filtering ? { label: 'Quitar filtro', onClick: clearFilters } : { label: 'Nueva petición', onClick: () => document.querySelector<HTMLInputElement>('input[aria-label="Título de la petición"]')?.focus() }} />
          ) : groups.map(({ stage, rows }) => (
            <div key={stage} role="group" aria-labelledby={`etapa-${stage}`}>
              <h2 id={`etapa-${stage}`} className="flex h-8 items-center gap-2 border-b border-subtle bg-card px-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {stageLabel[stage]}<span className="font-mono">{rows.length}</span>
              </h2>
              <ul>
                {rows.map((t) => <li key={t.id}><TaskRow task={t} run={byTask.get(t.id)} agent={agentsByRunId.get(byTask.get(t.id)?.id ?? '')} now={now} open={t.id === openId} onOpen={open} thumb={thumbs.get(t.id)} />
                  {stage === 'cerrando' && <ClosingNote task={t} onOpen={(from) => open(t, from)} />}</li>)}
              </ul>
            </div>
          ))}
      </section>

      {openId && <TaskSheet id={openId} task={openTask} agentsByRunId={agentsByRunId} onClose={close} />}
    </div>
  )
}
