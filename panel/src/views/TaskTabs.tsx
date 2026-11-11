import { useEffect, useRef, useState } from 'react'
import { humanError } from '@/lib/errors'
import { api, ApiError } from '@/api'
import { useArtifactSrc } from '@/hooks/artifact'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAction } from '@/feel/useAction'
import type { Run, TaskDetail } from '@/lib/tasks'
import { useStore } from '@/store'
import { parseDiffStat } from '@/lib/parseDiffStat'
import { DiffBars } from '@/visual/art/DiffBars'
import { ContinueTask } from './ContinueTask'
import { BRAND } from '@/lib/brand'

type Resource<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'unavailable' } | { state: 'error'; message: string }

/** Rutas del hito 2: si el servicio aún no las tiene responden 404 y la pestaña lo dice en vez de fallar. */
function useRunResource<T>(run: Run | undefined, suffix: string): Resource<T> {
  const [res, setRes] = useState<Resource<T>>({ state: 'loading' })
  const version = useStore((s) => s.version)
  useEffect(() => {
    if (!run) return
    let alive = true
    api<T>(`/runs/${encodeURIComponent(run.id)}/${suffix}`).then(
      (data) => alive && setRes({ state: 'ok', data }),
      (e: unknown) => alive && setRes(e instanceof ApiError && e.status === 404 ? { state: 'unavailable' } : { state: 'error', message: e instanceof Error ? e.message : 'error' }),
    )
    return () => { alive = false }
  }, [run?.id, suffix, version]) // eslint-disable-line react-hooks/exhaustive-deps
  return res
}

const latestRun = (d: TaskDetail): Run | undefined => [...d.runs].reverse().find((r) => r.state === 'running') ?? d.runs[d.runs.length - 1]

function Empty({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 py-6">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {children}
    </div>
  )
}

const waitingForWorkers = <Empty title="Available once workers run" hint="This tab fills in as soon as a worker starts on the task." />

interface OutputEvent { seq: number; createdAt: string; payload: { lines?: string[] } }
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function StopWorker({ run }: { run: Run }) {
  const [confirming, setConfirming] = useState(false)
  const stop = useAction(() => api(`/runs/${encodeURIComponent(run.id)}/stop`, { method: 'POST', body: {} }), { success: () => ({ title: 'Asked the worker to stop' }) })
  if (!confirming) return <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>Stop worker</Button>
  return (
    <div role="group" aria-label="Confirm stop" className="flex flex-wrap items-center gap-3 text-sm">
      <span>Stop the worker? Work done so far is kept.</span>
      <Button variant="destructive" size="sm" disabled={stop.pending} aria-busy={stop.pending} onClick={() => void stop.fire().then(() => setConfirming(false))}>{stop.pending ? 'Stopping…' : 'Stop'}</Button>
      <Button variant="ghost" size="sm" disabled={stop.pending} onClick={() => setConfirming(false)}>Cancel</Button>
    </div>
  )
}

export function WorkerChatTab({ detail }: { detail: TaskDetail }) {
  const run = latestRun(detail)
  const output = useRunResource<OutputEvent[]>(run, 'output?since=0')
  const waiting = useStore((s) => s.waiting[detail.task.id])
  const events = useStore((s) => s.events)
  const [text, setText] = useState('')
  const [sent, setSent] = useState<string[]>([])
  const draft = useRef('')
  const send = useAction(
    () => api(`/runs/${encodeURIComponent(run!.id)}/message`, { method: 'POST', body: { text: draft.current } }),
    { optimistic: () => { draft.current = text; setSent((s) => [...s, text]); setText(''); return () => { setSent((s) => s.slice(0, -1)); setText(draft.current) } } },
  )
  if (!run) return <Empty title="No runs for this task yet" hint={`When ${BRAND.short} assigns a worker, its conversation shows up here.`} />
  if (output.state === 'unavailable') return waitingForWorkers
  const batches = output.state === 'ok' ? output.data.filter((e) => e.payload.lines?.length) : []
  const corrections = events.filter((e) => e.type === 'worker.message_sent' && e.payload.runId === run.id)
  const running = run.state === 'running'
  return (
    <div className="flex flex-col gap-4">
      {waiting && running && (
        <section aria-label="Worker question" className="flex flex-col gap-1 rounded-lg border border-subtle bg-card p-4">
          <h3 className="text-sm font-medium text-warning">The worker is waiting for your answer</h3>
          <p className="text-sm whitespace-pre-wrap">{waiting.question}</p>
        </section>
      )}
      {output.state === 'error' && <p role="alert" className="text-sm text-error">Couldn’t read the conversation. {humanError(new Error(output.message))}</p>}
      {batches.length === 0 && output.state === 'ok' && <p className="text-sm text-muted-foreground">The worker hasn’t written anything yet.</p>}
      <ol className="flex flex-col gap-3">
        {batches.map((b) => (
          <li key={b.seq} className="flex gap-3">
            <time dateTime={b.createdAt} className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{clock(b.createdAt)}</time>
            <pre className="min-w-0 font-mono text-xs whitespace-pre-wrap">{b.payload.lines!.join('\n')}</pre>
          </li>
        ))}
        {corrections.map((e) => (
          <li key={e.seq} className="flex gap-3 text-xs text-info">
            <time dateTime={e.createdAt} className="w-16 shrink-0 font-mono">{clock(e.createdAt)}</time>
            <span>{BRAND.short} sent the worker a correction</span>
          </li>
        ))}
        {sent.map((m, i) => <li key={`s${i}`} className="text-xs whitespace-pre-wrap text-info">You: {m}</li>)}
      </ol>
      {detail.task.state === 'done' ? <ContinueTask taskId={detail.task.id} /> : <>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Request changes from the owner" placeholder="Ask the owner for a change…" name="mensaje" autoComplete="off" className="min-h-20" />
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={!text.trim() || send.pending || !running} aria-busy={send.pending} onClick={() => void send.fire()}>
          {send.pending ? 'Sending…' : 'Request changes'}
        </Button>
        {!running && <span className="text-xs text-muted-foreground">This run has ended.</span>}
        {send.error && <span role="alert" className="text-xs text-error">Not sent. {humanError(send.error)}</span>}
        {running && <span className="ml-auto"><StopWorker run={run} /></span>}
      </div></>}
    </div>
  )
}

/** Un archivo por bloque `diff --git`; el nombre es el de destino. */
const splitPatch = (patch: string) => patch.split(/(?=^diff --git )/m).filter(Boolean).map((block) => ({
  file: /^diff --git a\/.+ b\/(.+)$/m.exec(block)?.[1] ?? '', block,
}))
const inScope = (file: string, scope: string[]) => scope.some((s) => { const dir = s.replace(/\/+$/, ''); return file === dir || file.startsWith(`${dir}/`) })

export function ChangesTab({ detail }: { detail: TaskDetail }) {
  const run = latestRun(detail)
  const diff = useRunResource<{ stat: string; patch: string }>(run, 'diff')
  const [only, setOnly] = useState('')
  if (!run) return <Empty title="No changes yet" hint="The worker’s changes show up here once it starts writing code." />
  if (diff.state === 'unavailable') return waitingForWorkers
  if (diff.state === 'loading') return <p className="text-sm text-muted-foreground" role="status">Loading changes</p>
  if (diff.state === 'error') return <p role="alert" className="text-sm text-error">Couldn’t read the changes. {humanError(new Error(diff.message))}</p>
  const files = splitPatch(diff.data.patch)
  const scope = detail.task.scope ?? []
  const outside = scope.length ? files.filter((f) => f.file && !inScope(f.file, scope)).map((f) => f.file) : []
  const shown = only ? files.filter((f) => f.file === only) : files
  const stat = parseDiffStat(diff.data.stat)
  if (!files.length && !diff.data.stat) return <Empty title="The worker hasn’t changed any files yet" />
  return (
    <div className="flex flex-col gap-4">
      {outside.length > 0 && (
        <section role="alert" aria-label="Files outside the declared scope" className="flex flex-col gap-1 rounded-lg border border-subtle bg-card p-4">
          <h3 className="text-sm font-medium text-warning">Files outside the declared scope</h3>
          <ul className="font-mono text-xs">{outside.map((f) => <li key={f}>{f}</li>)}</ul>
        </section>
      )}
      {stat && <DiffBars added={stat.added} removed={stat.removed} files={stat.files} />}
      {diff.data.stat && <pre className="font-mono text-xs whitespace-pre-wrap text-muted-foreground">{diff.data.stat}</pre>}
      {files.length > 1 && (
        <select aria-label="Filter by file" value={only} onChange={(e) => setOnly(e.target.value)} className="h-8 self-start rounded-md border border-subtle bg-background px-2 font-mono text-xs">
          <option value="">All files</option>
          {files.map((f) => <option key={f.file} value={f.file}>{f.file}</option>)}
        </select>
      )}
      <pre className="overflow-x-auto font-mono text-xs">
        {shown.flatMap((f) => f.block.split('\n')).map((line, i) => (
          <div key={i} className={line.startsWith('+') && !line.startsWith('+++') ? 'text-success' : line.startsWith('-') && !line.startsWith('---') ? 'text-error' : line.startsWith('@@') ? 'text-info' : undefined}>{line || ' '}</div>
        ))}
      </pre>
    </div>
  )
}

export { TestsTab } from './TestsTab'

const kindLabel: Record<string, string> = { model: 'Model', texture: 'Texture', screenshot: 'Screenshot', video: 'Video', build: 'Build', report: 'Report', diff: 'Changes' }

function Thumb({ id, name }: { id: string; name: string }) {
  const src = useArtifactSrc(id)
  return src
    ? <img src={src} alt={name} width={160} height={96} className="h-24 w-40 rounded-md border border-subtle object-cover" />
    : <div aria-hidden className="h-24 w-40 rounded-md border border-subtle bg-card" />
}

export function ArtifactsTab({ detail }: { detail: TaskDetail }) {
  if (!detail.artifacts.length) return <Empty title="No assets yet" hint="Models, captures and reports show up here." />
  return (
    <ul className="grid grid-cols-2 gap-4">
      {detail.artifacts.map((a) => {
        const name = a.path.split('/').pop() ?? a.path
        return (
          <li key={a.id} className="flex flex-col gap-2 text-sm">
            {/\.(png|jpe?g|webp)$/i.test(a.path) ? <Thumb id={a.id} name={name} /> : <div aria-hidden className="h-24 w-40 rounded-md border border-subtle bg-card" />}
            <span className="truncate font-mono text-xs" title={a.path}>{name}</span>
            <span className="text-xs text-muted-foreground">{kindLabel[a.kind] ?? a.kind}{a.license ? ` · ${a.license}` : ''}</span>
          </li>
        )
      })}
    </ul>
  )
}

export { TimelineTab } from './TimelineTab'
