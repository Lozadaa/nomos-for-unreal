import { useEffect, useRef, useState } from 'react'
import { humanError } from '@/lib/errors'
import { api, ApiError } from '@/api'
import { useArtifactSrc } from '@/hooks/artifact'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { StatusDot } from '@/components/StatusDot'
import { useAction } from '@/feel/useAction'
import { relativeTime } from '@/lib/time'
import type { Run, TaskDetail, TestRun, Tone } from '@/lib/tasks'
import { useStore } from '@/store'
import { eventText } from '@/lib/events'

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

const waitingForWorkers = <Empty title="Disponible cuando haya workers" hint="Esta pestaña se llena en cuanto un worker empiece a trabajar en la tarea." />

export function WorkerChatTab({ detail }: { detail: TaskDetail }) {
  const run = latestRun(detail)
  const output = useRunResource<{ seq?: number; payload?: { text?: string }; text?: string; createdAt?: string }[]>(run, 'output?since=0')
  const [text, setText] = useState('')
  const [sent, setSent] = useState<string[]>([])
  const draft = useRef('')
  const send = useAction(
    () => api(`/runs/${encodeURIComponent(run!.id)}/message`, { method: 'POST', body: { text: draft.current } }),
    { optimistic: () => { draft.current = text; setSent((s) => [...s, text]); setText(''); return () => { setSent((s) => s.slice(0, -1)); setText(draft.current) } } },
  )
  if (!run) return <Empty title="Esta tarea aún no tiene una ejecución" hint="Cuando Kratos asigne un worker, su conversación aparece aquí." />
  if (output.state === 'unavailable') return waitingForWorkers
  const lines = output.state === 'ok' ? output.data : []
  return (
    <div className="flex flex-col gap-4">
      {output.state === 'error' && <p role="alert" className="text-sm text-error">No se pudo leer la conversación. {humanError(new Error(output.message))}</p>}
      <ul className="flex flex-col gap-1 font-mono text-xs">
        {lines.map((l, i) => <li key={l.seq ?? i} className="whitespace-pre-wrap">{l.payload?.text ?? l.text ?? ''}</li>)}
        {sent.map((s, i) => <li key={`s${i}`} className="whitespace-pre-wrap text-info">Tú: {s}</li>)}
      </ul>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Pedir cambios al responsable" placeholder="Pide un cambio al responsable…" name="mensaje" autoComplete="off" className="min-h-20" />
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!text.trim() || send.pending || run.state !== 'running'} aria-busy={send.pending} onClick={() => void send.fire()}>
          {send.pending ? 'Enviando…' : 'Enviar al worker'}
        </Button>
        {run.state !== 'running' && <span className="text-xs text-muted-foreground">La ejecución ya terminó.</span>}
        {send.error && <span role="alert" className="text-xs text-error">No se envió. {humanError(send.error)}</span>}
      </div>
    </div>
  )
}

export function ChangesTab({ detail }: { detail: TaskDetail }) {
  const run = latestRun(detail)
  const diff = useRunResource<{ stat: string; patch: string }>(run, 'diff')
  if (!run) return <Empty title="Esta tarea aún no tiene cambios" hint="Los cambios del worker aparecen aquí cuando empiece a escribir código." />
  if (diff.state === 'unavailable') return waitingForWorkers
  if (diff.state === 'loading') return <p className="text-sm text-muted-foreground" role="status">Cargando los cambios</p>
  if (diff.state === 'error') return <p role="alert" className="text-sm text-error">No se pudieron leer los cambios. {humanError(new Error(diff.message))}</p>
  return (
    <div className="flex flex-col gap-4">
      {diff.data.stat && <pre className="font-mono text-xs whitespace-pre-wrap text-muted-foreground">{diff.data.stat}</pre>}
      <pre className="overflow-x-auto font-mono text-xs">
        {diff.data.patch.split('\n').map((line, i) => (
          <div key={i} className={line.startsWith('+') && !line.startsWith('+++') ? 'text-success' : line.startsWith('-') && !line.startsWith('---') ? 'text-error' : line.startsWith('@@') ? 'text-info' : undefined}>{line || ' '}</div>
        ))}
      </pre>
    </div>
  )
}

const resultLook: Record<TestRun['result'], [string, Tone]> = {
  passed: ['Superada', 'success'], failed: ['Fallida', 'error'], pending: ['Pendiente', 'neutral'],
  running: ['En curso', 'info'], skipped: ['Omitida', 'neutral'], unavailable: ['No disponible', 'warning'],
}

export function TestsTab({ detail }: { detail: TaskDetail }) {
  if (!detail.testRuns.length) return <Empty title="Esta tarea aún no tiene pruebas" hint="Las pruebas aparecen cuando Kratos las lanza al revisar la tarea." />
  return (
    <ul className="flex flex-col">
      {detail.testRuns.map((t) => {
        const [text, tone] = resultLook[t.result]
        return (
          <li key={t.id} className="flex h-10 items-center gap-3 border-b border-subtle text-sm">
            <StatusDot tone={tone} />
            <span>{text}</span>
            {t.map && <span className="font-mono text-xs text-muted-foreground">{t.map}</span>}
            {t.commit && <span className="font-mono text-xs text-muted-foreground">{t.commit.slice(0, 7)}</span>}
            <span className="ml-auto text-xs text-muted-foreground">{relativeTime(t.createdAt)}</span>
          </li>
        )
      })}
    </ul>
  )
}

const kindLabel: Record<string, string> = { model: 'Modelo', texture: 'Textura', screenshot: 'Captura', video: 'Vídeo', build: 'Compilación', report: 'Informe', diff: 'Cambios' }

function Thumb({ id, name }: { id: string; name: string }) {
  const src = useArtifactSrc(id)
  return src
    ? <img src={src} alt={name} width={160} height={96} className="h-24 w-40 rounded-md border border-subtle object-cover" />
    : <div aria-hidden className="h-24 w-40 rounded-md border border-subtle bg-card" />
}

export function ArtifactsTab({ detail }: { detail: TaskDetail }) {
  if (!detail.artifacts.length) return <Empty title="Esta tarea aún no tiene assets" hint="Los modelos, capturas e informes aparecen aquí." />
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

export function TimelineTab({ detail }: { detail: TaskDetail }) {
  if (!detail.events.length) return <Empty title="Todavía no hay historia" hint="Cada cambio de la tarea queda anotado aquí." />
  return (
    <ol className="flex flex-col">
      {[...detail.events].reverse().map((e) => (
        <li key={e.seq} className="flex gap-3 border-b border-subtle py-2 text-sm">
          <span className="w-20 shrink-0 text-xs text-muted-foreground">{relativeTime(e.createdAt)}</span>
          <span>{eventText(e)}</span>
        </li>
      ))}
    </ol>
  )
}
