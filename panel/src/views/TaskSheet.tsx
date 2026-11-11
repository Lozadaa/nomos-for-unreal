import { useEffect, useRef, useState } from 'react'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SheetSkeleton } from '@/components/Skeletons'
import { StageStepper } from '@/components/StageStepper'
import { StatusDot } from '@/components/StatusDot'
import { nameFor } from '@/feel/transitions'
import { useAfter } from '@/hooks/time'
import { relativeTime } from '@/lib/time'
import { Markdown } from '@/lib/markdown'
import { cn } from '@/lib/utils'
import { areaLabel, millions, tokensLine, providerLabel, shortId, stageLabel, statusOf, statusText, toneOf, type Task, type TaskDetail } from '@/lib/tasks'
import { useStore } from '@/store'
import { Glyph } from '@/visual/Glyph'
import { glyphFor } from '@/visual/glyphs'
import { AgentAvatar } from '@/visual/art/AgentAvatar'
import { agentName, assignAgentNames } from '@/visual/art/agentName'
import { ArtifactsTab, ChangesTab, TimelineTab, WorkerChatTab } from './TaskTabs'
import { TestsTab } from './TestsTab'
import { ArchiveTab, Attribution } from './Closing'
import { RequestChanges } from './RequestChanges'
import { DecisionCard, isCheckDecision } from './DecisionCard'
import { XIcon } from 'lucide-react'

export interface AgentIdentity { name: string; ordinal?: number }

export function TaskSheet({ id, task: fromStore, agentsByRunId, onClose }: {
  id: string; task?: Task; agentsByRunId?: ReadonlyMap<string, AgentIdentity>; onClose: () => void | Promise<void>
}) {
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const version = useStore((s) => s.version)
  const waiting = useStore((s) => s.waiting[id])
  const [reloads, setReloads] = useState(0)
  const first = useRef(true)

  // se vuelve a pedir el detalle cuando llega un evento (agrupados en 100 ms) o cuando una decisión caduca
  useEffect(() => {
    let alive = true
    const wait = first.current ? 0 : 100
    first.current = false
    const timer = setTimeout(() => {
      api<TaskDetail>(`/tasks/${encodeURIComponent(id)}`).then(
        (d) => { if (alive) { setDetail(d); setFailed(false) } },
        () => { if (alive) setFailed(true) },
      )
    }, wait)
    return () => { alive = false; clearTimeout(timer) }
  }, [id, version, reloads])

  const task = fromStore ?? detail?.task
  const slow = useAfter(!detail && !failed)
  const orderedRuns = [...(detail?.runs ?? [])].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
  const runAgents = new Map(assignAgentNames(orderedRuns.map((run) => ({ ...run, area: task?.area })))
    .map((agent) => [agent.id, agentsByRunId?.get(agent.id) ?? { name: agent.name, ordinal: agent.ordinal }]))
  const assignee = orderedRuns.findLast((run) => run.state === 'running') ?? orderedRuns.at(-1)
  const assigneeProvider = assignee?.provider ?? task?.assigneeProvider
  const assigneeRole = assignee?.role ?? task?.assigneeRole
  const assigneeAgent = assignee && runAgents.get(assignee.id)
  const assigneeName = assigneeAgent?.name ?? (task ? agentName(assigneeRole, task.area) : '')
  const assigneeState = assignee?.state !== 'running' ? 'idle' : waiting?.runId === assignee.id || assignee.metadata?.waiting ? 'waiting' : 'running'

  return (
    <Sheet open onOpenChange={(open) => { if (!open) void onClose() }}>
      <SheetContent
        showCloseButton={false}
        aria-label={task ? `${task.title} details` : 'Task details'}
        className="data-[side=right]:w-[720px] data-[side=right]:max-w-[100vw] data-[side=right]:sm:max-w-[720px] gap-0 [view-transition-name:k-sheet]"
      >
        <SheetHeader className="gap-3 border-b border-subtle p-6 pr-14">
          <SheetClose render={<Button variant="ghost" size="icon-sm" className="absolute top-4 right-4" aria-label="Close details" />}>
            <XIcon aria-hidden />
          </SheetClose>
          <div className="flex items-baseline gap-3">
            <SheetTitle
              className="min-w-0 truncate text-lg font-semibold"
              style={{ viewTransitionName: nameFor('task', id), viewTransitionClass: 'k-title' } as React.CSSProperties}
            >
              {task?.title ?? 'Task'}
            </SheetTitle>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{shortId(id)}</span>
          </div>
          {task && (
            <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-2">Area: <Glyph kind="area" value={task.area} />{areaLabel[task.area]}</span>
              <span className="inline-flex items-center gap-2">Status: <Glyph kind="taskState" value={statusOf(task) === 'normal' ? task.state : statusOf(task)} tone={toneOf(task)} /><StatusDot tone={toneOf(task)} />{statusText(task)}</span>
              {assigneeProvider && <span className="inline-flex items-center gap-2"><AgentAvatar id={assignee?.id ?? task.id} provider={assigneeProvider} model={assignee?.metadata?.model} name={assigneeName} ordinal={assigneeAgent?.ordinal} state={assigneeState} size={32} /><span>{assigneeName}</span><span>{providerLabel[assigneeProvider] ?? glyphFor('provider', assigneeProvider).label}</span>{assigneeRole && <Glyph kind="role" value={assigneeRole} />}</span>}
              <span>Stage: {stageLabel[task.state]}</span>
              <span>Updated {relativeTime(task.updatedAt)}</span>
            </SheetDescription>
          )}
          {task && <div className="pt-2"><StageStepper task={task} /></div>}
          {task?.failure && (
            <p className="text-sm break-words text-muted-foreground" role="note">
              <span className="text-error">{task.failure.text}.</span>{task.failure.detail && task.failure.detail !== task.failure.text ? ` ${task.failure.detail}` : ''}
            </p>
          )}
          {task && !task.failure && task.waitReason && statusOf(task) === 'normal' && (
            <p className="text-sm break-words text-muted-foreground" role="note">{task.waitReason}</p>
          )}
          {task && statusOf(task) !== 'normal' && task.blockedReason && (
            <p className="text-sm break-words text-muted-foreground" role="note">
              <span className={statusOf(task) === 'decision' ? 'text-warning' : task.state === 'cerrando' ? 'text-warning' : 'text-error'}>{statusText(task)}.</span>{' '}
              {task.blockedReason}
            </p>
          )}
        </SheetHeader>

        {failed && !detail ? (
          <p role="alert" className="p-6 text-sm text-error">Couldn’t load the task details. Close the panel and open it again.</p>
        ) : !detail ? (
          slow ? <SheetSkeleton /> : null
        ) : (
          <Tabs defaultValue="resumen" className="min-h-0 flex-1 gap-0">
            <TabsList variant="line" className="h-10 w-full shrink-0 justify-start gap-1 border-b border-subtle px-4">
              {[['resumen', 'Summary'], ['chat', 'Chat'], ['cambios', 'Changes'], ['pruebas', 'Tests'], ['assets', 'Assets'], ['linea', 'Timeline'],
                ...(detail.task.state === 'done' ? [['archivo', 'Archive']] : [])].map(([v, label]) => (
                <TabsTrigger key={v} value={v} className="flex-none px-3">{label}</TabsTrigger>
              ))}
            </TabsList>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <TabsContent value="resumen" className="p-6"><Summary detail={detail} task={task ?? detail.task} agentsByRunId={runAgents} onStale={() => setReloads((n) => n + 1)} /></TabsContent>
              <TabsContent value="chat" className="p-6"><WorkerChatTab detail={detail} /></TabsContent>
              <TabsContent value="cambios" className="p-6"><ChangesTab detail={detail} /></TabsContent>
              <TabsContent value="pruebas" className="p-6"><TestsTab detail={detail} decisionCard={detail.decision?.state === 'open' && isCheckDecision(detail.decision)
                ? <DecisionCard decision={detail.decision} task={task ?? detail.task} onStale={() => setReloads((n) => n + 1)} /> : null} /></TabsContent>
              <TabsContent value="assets" className="p-6"><ArtifactsTab detail={detail} /></TabsContent>
              <TabsContent value="linea" className="p-6"><TimelineTab detail={detail} /></TabsContent>
              {detail.task.state === 'done' && <TabsContent value="archivo" className="p-6"><ArchiveTab taskId={id} /></TabsContent>}
            </div>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  )
}

const label = 'text-xs font-medium tracking-wider text-muted-foreground uppercase'
const openSections = ['Qué', 'Criterios de aceptación']
/** Las secciones `## ` de la spec (hito 23); null si no las tiene. ponytail: no salta `## ` dentro de bloques de código. */
const specSections = (spec: string) => {
  const parts = spec.split(/^## (.+)$/m)
  return parts.length < 3 ? null : parts.slice(1).flatMap((p, i) => i % 2 ? [] : [{ title: p.trim(), body: parts[i + 2].trim() }])
}

function Summary({ detail, task, agentsByRunId, onStale }: {
  detail: TaskDetail; task: Task; agentsByRunId: ReadonlyMap<string, AgentIdentity>; onStale: () => void
}) {
  const waiting = useStore((s) => s.waiting[task.id])
  const sections = specSections(task.spec)
  return (
    <div className="flex flex-col gap-6">
      {detail.decision?.state === 'open' && <DecisionCard decision={detail.decision} task={task} onStale={onStale} />}
      {detail.decision && detail.decision.state === 'resolved' && (
        <p className="text-sm text-muted-foreground" role="status">
          You chose {detail.decision.options.find((o) => o.id === detail.decision!.chosenOptionId)?.label ?? 'an option'}. Your choice is recorded.
        </p>
      )}
      {sections ? <div className="flex flex-col gap-2">{sections.map(({ title, body }) => {
        const lines = body.split('\n').filter((l) => l.trim()).length
        return (
          <details key={title} open={openSections.includes(title)} className="group flex flex-col gap-2">
            <summary className={cn(label, 'cursor-pointer')}><span>{title}</span>
              <span className="normal-case group-open:hidden"> · {lines} {lines === 1 ? 'line' : 'lines'}</span></summary>
            <Markdown clamp className="mt-2 text-sm" text={body} />
          </details>
        )
      })}</div> : <section className="flex flex-col gap-2">
        <h3 className={label}>What’s asked</h3>
        <Markdown clamp className="text-sm" text={task.spec || 'This task has no description.'} />
      </section>}
      {!sections && task.acceptance.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className={label}>Criteria</h3>
          <ul className="list-disc pl-5 text-sm">{task.acceptance.map((a) => <li key={a}>{a}</li>)}</ul>
        </section>
      )}
      {detail.runs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className={label}>Runs</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {detail.runs.map((r) => (
              <li key={r.id} className="flex items-baseline gap-3">
                <StatusDot tone={r.state === 'running' ? 'info' : r.state === 'done' ? 'success' : r.state === 'failed' ? 'error' : 'neutral'} />
                <AgentAvatar id={r.id} provider={r.provider} model={r.metadata?.model} name={agentsByRunId.get(r.id)?.name} ordinal={agentsByRunId.get(r.id)?.ordinal} state={r.state !== 'running' ? 'idle' : waiting?.runId === r.id || r.metadata?.waiting ? 'waiting' : 'running'} size={32} />
                <span>{agentsByRunId.get(r.id)?.name}</span>
                <Glyph kind="role" value={r.role} />
                {r.metadata?.model && <span className="text-xs text-muted-foreground">{r.metadata.model}</span>}
                {r.summary && <Markdown clamp className="min-w-0 text-muted-foreground" text={r.summary} />}
                {detail.tokens?.filter((s) => s.runId === r.id).map((s) => <span key={s.runId} className="ml-auto shrink-0 text-xs text-muted-foreground">{tokensLine(s)}</span>)}
              </li>
            ))}
          </ul>
          {!!detail.tokens?.length && <p className="text-xs text-muted-foreground">Task total: {millions(detail.tokens.reduce((n, s) => n + s.amount, 0))} tokens</p>}
        </section>
      )}
      <Attribution task={detail.task} />
      <RequestChanges task={task} />
    </div>
  )
}
