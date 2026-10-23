import { useEffect, useRef, useState } from 'react'
import { humanError } from '@/lib/errors'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { SheetSkeleton } from '@/components/Skeletons'
import { StageStepper } from '@/components/StageStepper'
import { DecisionDetails, DecisionOptions, decisionText } from '@/components/DecisionOptions'
import { StatusDot } from '@/components/StatusDot'
import { nameFor } from '@/feel/transitions'
import { useAction } from '@/feel/useAction'
import { useAfter } from '@/hooks/time'
import { relativeTime } from '@/lib/time'
import { areaLabel, providerLabel, shortId, stageLabel, statusOf, statusText, toneOf, type Decision, type Task, type TaskDetail } from '@/lib/tasks'
import { patchTask, useStore } from '@/store'
import { Glyph } from '@/visual/Glyph'
import { glyphFor } from '@/visual/glyphs'
import { AgentAvatar } from '@/visual/art/AgentAvatar'
import { agentName, assignAgentNames } from '@/visual/art/agentName'
import { ArtifactsTab, ChangesTab, TimelineTab, WorkerChatTab } from './TaskTabs'
import { TestsTab } from './TestsTab'
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
        aria-label={task ? `Detalle de ${task.title}` : 'Detalle de la tarea'}
        className="data-[side=right]:w-[720px] data-[side=right]:max-w-[100vw] data-[side=right]:sm:max-w-[720px] gap-0 [view-transition-name:k-sheet]"
      >
        <SheetHeader className="gap-3 border-b border-subtle p-6 pr-14">
          <SheetClose render={<Button variant="ghost" size="icon-sm" className="absolute top-4 right-4" aria-label="Cerrar detalle" />}>
            <XIcon aria-hidden />
          </SheetClose>
          <div className="flex items-baseline gap-3">
            <SheetTitle
              className="min-w-0 truncate text-lg font-semibold"
              style={{ viewTransitionName: nameFor('task', id), viewTransitionClass: 'k-title' } as React.CSSProperties}
            >
              {task?.title ?? 'Tarea'}
            </SheetTitle>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{shortId(id)}</span>
          </div>
          {task && (
            <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-2">Área: <Glyph kind="area" value={task.area} />{areaLabel[task.area]}</span>
              <span className="inline-flex items-center gap-2">Estado: <Glyph kind="taskState" value={statusOf(task) === 'normal' ? task.state : statusOf(task)} tone={toneOf(task)} /><StatusDot tone={toneOf(task)} />{statusText(task)}</span>
              {assigneeProvider && <span className="inline-flex items-center gap-2"><AgentAvatar id={assignee?.id ?? task.id} provider={assigneeProvider} name={assigneeName} ordinal={assigneeAgent?.ordinal} state={assigneeState} size={32} /><span>{assigneeName}</span><span>{providerLabel[assigneeProvider] ?? glyphFor('provider', assigneeProvider).label}</span>{assigneeRole && <Glyph kind="role" value={assigneeRole} />}</span>}
              <span>Etapa: {stageLabel[task.state]}</span>
              <span>Actualizada {relativeTime(task.updatedAt)}</span>
            </SheetDescription>
          )}
          {task && <div className="pt-2"><StageStepper task={task} /></div>}
          {task && statusOf(task) !== 'normal' && task.blockedReason && (
            <p className="text-sm break-words text-muted-foreground" role="note">
              <span className={statusOf(task) === 'decision' ? 'text-warning' : task.state === 'cerrando' ? 'text-warning' : 'text-error'}>{statusText(task)}.</span>{' '}
              {task.blockedReason}
            </p>
          )}
        </SheetHeader>

        {failed && !detail ? (
          <p role="alert" className="p-6 text-sm text-error">No se pudo cargar el detalle de la tarea. Cierra el panel y vuelve a abrirlo.</p>
        ) : !detail ? (
          slow ? <SheetSkeleton /> : null
        ) : (
          <Tabs defaultValue="resumen" className="min-h-0 flex-1 gap-0">
            <TabsList variant="line" className="h-10 w-full shrink-0 justify-start gap-1 border-b border-subtle px-4">
              {[['resumen', 'Resumen'], ['chat', 'Chat'], ['cambios', 'Cambios'], ['pruebas', 'Pruebas'], ['assets', 'Assets'], ['linea', 'Línea de tiempo']].map(([v, label]) => (
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
            </div>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  )
}

const label = 'text-xs font-medium tracking-wider text-muted-foreground uppercase'

function Summary({ detail, task, agentsByRunId, onStale }: {
  detail: TaskDetail; task: Task; agentsByRunId: ReadonlyMap<string, AgentIdentity>; onStale: () => void
}) {
  const waiting = useStore((s) => s.waiting[task.id])
  return (
    <div className="flex flex-col gap-6">
      {detail.decision?.state === 'open' && <DecisionCard decision={detail.decision} task={task} onStale={onStale} />}
      {detail.decision && detail.decision.state === 'resolved' && (
        <p className="text-sm text-muted-foreground" role="status">
          Elegiste {detail.decision.options.find((o) => o.id === detail.decision!.chosenOptionId)?.label ?? 'una opción'}. Se registró tu elección.
        </p>
      )}
      <section className="flex flex-col gap-2">
        <h3 className={label}>Qué se pide</h3>
        <p className="text-sm whitespace-pre-wrap">{task.spec || 'Esta tarea no tiene descripción.'}</p>
      </section>
      {task.acceptance.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className={label}>Criterios</h3>
          <ul className="list-disc pl-5 text-sm">{task.acceptance.map((a) => <li key={a}>{a}</li>)}</ul>
        </section>
      )}
      {detail.runs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className={label}>Ejecuciones</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {detail.runs.map((r) => (
              <li key={r.id} className="flex items-baseline gap-3">
                <StatusDot tone={r.state === 'running' ? 'info' : r.state === 'done' ? 'success' : r.state === 'failed' ? 'error' : 'neutral'} />
                <AgentAvatar id={r.id} provider={r.provider} name={agentsByRunId.get(r.id)?.name} ordinal={agentsByRunId.get(r.id)?.ordinal} state={r.state !== 'running' ? 'idle' : waiting?.runId === r.id || r.metadata?.waiting ? 'waiting' : 'running'} size={32} />
                <span>{agentsByRunId.get(r.id)?.name}</span>
                <Glyph kind="role" value={r.role} />
                <span className="text-muted-foreground">{r.summary ?? ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <RequestChanges task={task} />
    </div>
  )
}

// Decisiones que abre checks.run (comprobación no disponible, assets rotos): también se responden desde la pestaña Pruebas
const isCheckDecision = (d: Decision) => d.evidence.some((e) => e.kind === 'gate:checks' || e.kind === 'command')

function DecisionCard({ decision, task, onStale }: { decision: Decision; task: Task; onStale: () => void }) {
  const [chosen, setChosen] = useState<string | null>(null)
  const option = useRef('')
  const action = useAction(
    () => api(`/decisions/${encodeURIComponent(decision.id)}/resolve`, { method: 'POST', body: { optionId: option.current, by: 'director' } }),
    {
      // la fila deja de esperar decisión en el acto; si el servidor la rechaza, vuelve atrás
      optimistic: () => patchTask(task.id, { decisionId: null, blockedReason: task.blockedReason === decision.reason ? null : task.blockedReason }),
      reload: () => { setChosen(null); onStale() },
    },
  )
  const choose = (id: string) => { option.current = id; setChosen(id); void action.fire() }
  return (
    <section aria-label="Decisión pendiente" data-decision-card className="flex flex-col gap-3 rounded-lg border border-subtle bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 aria-label={decision.reason} title={decision.reason} className="text-base font-medium">{decisionText(decision).reason}</h3>
        <DecisionDetails decision={decision} taskTitle={task.title} />
      </div>
      <DecisionOptions decision={decision} area={task.area} selected={chosen} disabled={action.pending} onChoose={choose} />
      {action.pending && <p className="text-xs text-muted-foreground" role="status">Registrando tu elección…</p>}
      {action.error && !action.pending && <p className="text-xs text-error" role="alert">No se registró la elección. {humanError(action.error)}</p>}
    </section>
  )
}

function RequestChanges({ task }: { task: Task }) {
  const [text, setText] = useState('')
  const [sentText, setSentText] = useState<string | null>(null)
  const draft = useRef('')
  const action = useAction(
    () => api('/messages', { method: 'POST', body: { text: `Cambios en «${task.title}» (${shortId(task.id)}): ${draft.current}` } }),
    {
      optimistic: () => { draft.current = text; setSentText(text); setText(''); return () => { setSentText(null); setText(draft.current) } },
    },
  )
  return (
    <section className="flex flex-col gap-2">
      <h3 className={label}>Pedir cambios</h3>
      {task.state === 'done' && (
        <p className="text-sm text-muted-foreground">
          Esta tarea ya está hecha. Tu mensaje abre una continuación con {providerLabel[task.assigneeProvider ?? ''] ?? 'Kratos'}, que la hizo.
        </p>
      )}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) { e.preventDefault(); void action.fire() } }}
        placeholder="Qué debería cambiar…" name="cambios" autoComplete="off"
        aria-label="Pedir cambios al responsable"
        className="min-h-20"
      />
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!text.trim() || action.pending} aria-busy={action.pending} onClick={() => void action.fire()}>
          {action.pending ? 'Enviando…' : 'Pedir cambios'}
        </Button>
        {sentText && !action.error && (
          <span role="status" className="text-xs text-muted-foreground">{action.pending ? 'Enviado · esperando confirmación de Kratos' : 'Recibido · Kratos lo atenderá en breve'}</span>
        )}
        {action.error && <span role="alert" className="text-xs text-error">No se envió. {humanError(action.error)}</span>}
      </div>
    </section>
  )
}
