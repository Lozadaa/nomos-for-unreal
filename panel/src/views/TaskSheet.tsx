import { useEffect, useRef, useState } from 'react'
import { humanError } from '@/lib/errors'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { SheetSkeleton } from '@/components/Skeletons'
import { StageStepper } from '@/components/StageStepper'
import { StatusDot } from '@/components/StatusDot'
import { nameFor } from '@/feel/transitions'
import { useAction } from '@/feel/useAction'
import { useAfter } from '@/hooks/time'
import { relativeTime } from '@/lib/time'
import { areaLabel, providerLabel, shortId, statusOf, statusText, toneOf, type Decision, type Task, type TaskDetail } from '@/lib/tasks'
import { patchTask, useStore } from '@/store'
import { ArtifactsTab, ChangesTab, TestsTab, TimelineTab, WorkerChatTab } from './TaskTabs'
import { XIcon } from 'lucide-react'

export function TaskSheet({ id, task: fromStore, onClose }: { id: string; task?: Task; onClose: () => void | Promise<void> }) {
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const version = useStore((s) => s.version)
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
              <span className="inline-flex items-center gap-2"><StatusDot tone={toneOf(task)} />{statusText(task)}</span>
              <span>{areaLabel[task.area]}</span>
              {task.assigneeProvider && <span>{[task.assigneeRole, providerLabel[task.assigneeProvider] ?? task.assigneeProvider].filter(Boolean).join(' · ')}</span>}
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
              <TabsContent value="resumen" className="p-6"><Summary detail={detail} task={task ?? detail.task} onStale={() => setReloads((n) => n + 1)} /></TabsContent>
              <TabsContent value="chat" className="p-6"><WorkerChatTab detail={detail} /></TabsContent>
              <TabsContent value="cambios" className="p-6"><ChangesTab detail={detail} /></TabsContent>
              <TabsContent value="pruebas" className="p-6"><TestsTab detail={detail} /></TabsContent>
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

function Summary({ detail, task, onStale }: { detail: TaskDetail; task: Task; onStale: () => void }) {
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
                <span>{providerLabel[r.provider] ?? r.provider} · {r.role}</span>
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
    <section aria-label="Decisión pendiente" className="flex flex-col gap-3 rounded-lg border border-subtle bg-card p-4">
      <h3 className="text-base font-medium">{decision.reason}</h3>
      {decision.evidence.length > 0 && (
        <ul className="text-xs text-muted-foreground">{decision.evidence.map((e) => <li key={e.ref}><span className="font-mono">{e.kind}</span> · {e.ref}</li>)}</ul>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Opciones">
        {decision.options.map((o) => (
          <div key={o.id} className="flex flex-col items-start gap-1">
            <Button variant={chosen === o.id ? 'default' : 'outline'} aria-pressed={chosen === o.id} disabled={action.pending} onClick={() => choose(o.id)}>{o.label}</Button>
            {o.description && <span className="max-w-48 text-xs text-muted-foreground">{o.description}</span>}
          </div>
        ))}
      </div>
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
