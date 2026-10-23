import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Composer } from '@/components/Composer'
import { RowsSkeleton } from '@/components/Skeletons'
import { TaskRow } from '@/components/TaskRow'
import { animateUpdate, withViewTransition } from '@/feel/transitions'
import { useAfter, useNow } from '@/hooks/time'
import { useParam } from '@/hooks/useParam'
import { stageLabel, stages, type Stage, type Task } from '@/lib/tasks'
import { useStore } from '@/store'
import { TaskSheet } from './TaskSheet'

type Filter = 'todas' | Stage

export function Produccion() {
  const tasks = useStore((s) => s.tasks)
  const loaded = useStore((s) => s.loaded)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const openId = params.get('tarea')
  const [filterParam, setFilter] = useParam('etapa', 'todas')
  const filter = filterParam as Filter
  const [query, setQuery] = useState('')
  const now = useNow()
  const showSkeleton = useAfter(!loaded)
  const opener = useRef<HTMLElement | null>(null)

  const q = query.trim().toLowerCase()
  const matches = (t: Task) =>
    (filter === 'todas' || t.state === filter) &&
    (!q || `${t.title} ${t.id} ${t.assigneeProvider ?? ''} ${t.assigneeRole ?? ''}`.toLowerCase().includes(q))

  const groups = useMemo(() => stages
    .map((stage) => ({ stage, rows: tasks.filter((t) => t.state === stage && matches(t)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }))
    .filter((g) => g.rows.length), [tasks, filter, q]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = new Map<Stage, number>()
    for (const t of tasks) c.set(t.state, (c.get(t.state) ?? 0) + 1)
    return c
  }, [tasks])

  const go = (to: string) => withViewTransition(() => navigate(to, { flushSync: true }))
  const rowOf = (id: string | null) => document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id ?? '')}"]`)
  const open = (task: Task, from: HTMLElement) => { opener.current = from; void go(`/?tarea=${encodeURIComponent(task.id)}`) }
  const close = async () => {
    const id = openId
    await go('/')
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

      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          aria-label="Filtrar por etapa"
          value={[filter]}
          onValueChange={(v) => void animateUpdate(() => setFilter(v[0] ?? 'todas'))}
          variant="outline"
          size="sm"
          spacing={0}
        >
          <ToggleGroupItem value="todas">Todas</ToggleGroupItem>
          {stages.map((s) => (
            <ToggleGroupItem key={s} value={s}>
              {stageLabel[s]}{counts.get(s) ? <span className="ml-1.5 font-mono text-xs text-muted-foreground">{counts.get(s)}</span> : null}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
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
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <h2 className="text-base font-medium">{filtering ? 'Ninguna tarea coincide con el filtro' : 'Escribe la primera petición a Kratos'}</h2>
              <p className="text-sm text-muted-foreground">{filtering ? 'Prueba con otra etapa o con otra búsqueda.' : 'Kratos la convierte en tareas y las reparte.'}</p>
              {filtering
                ? <Button variant="outline" size="sm" onClick={clearFilters}>Quitar filtro</Button>
                : <Button size="sm" onClick={() => document.querySelector<HTMLInputElement>('input[aria-label="Título de la petición"]')?.focus()}>Nueva petición</Button>}
            </div>
          ) : groups.map(({ stage, rows }) => (
            <div key={stage} role="group" aria-labelledby={`etapa-${stage}`}>
              <h2 id={`etapa-${stage}`} className="flex h-8 items-center gap-2 border-b border-subtle bg-card px-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {stageLabel[stage]}<span className="font-mono">{rows.length}</span>
              </h2>
              <ul>
                {rows.map((t) => <li key={t.id}><TaskRow task={t} now={now} open={t.id === openId} onOpen={open} /></li>)}
              </ul>
            </div>
          ))}
      </section>

      {openId && <TaskSheet id={openId} task={openTask} onClose={close} />}
    </div>
  )
}
