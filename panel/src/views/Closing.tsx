import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { useAction } from '@/feel/useAction'
import { authedUrl } from '@/hooks/artifact'
import { useResource } from '@/hooks/useResource'
import { humanError } from '@/lib/errors'
import type { Task } from '@/lib/tasks'
import { AgentAvatar } from '@/visual/art/AgentAvatar'

const roleLabel: Record<string, string> = { implemento: 'Built', reviso: 'Reviewed', genero: 'Generated', integro: 'Merged', verifico: 'Verified' }
const roleOrder = Object.keys(roleLabel)

/** Fila «Cerrando» de Producción: el motivo y la acción que corresponde. */
export function ClosingNote({ task, onOpen }: { task: Task; onOpen: (from: HTMLElement) => void }) {
  const retry = useAction(() => api(`/tasks/${encodeURIComponent(task.id)}/finalize`, { method: 'POST', body: {} }),
    { success: () => ({ title: 'Wrap-up requested again' }) })
  const reason = task.blockedReason ?? task.waitReason
  if (!reason && !task.decisionId) return null
  return (
    <div className="flex min-h-9 items-center gap-3 border-b border-subtle bg-background pr-4 pl-[76px] text-xs">
      <span className="min-w-0 truncate text-warning" title={reason ?? undefined}>{reason ?? 'Waiting on a decision'}</span>
      {task.decisionId
        ? <Button variant="outline" size="xs" className="ml-auto" onClick={(e) => onOpen(e.currentTarget)}>Decide</Button>
        : <Button variant="outline" size="xs" className="ml-auto" disabled={retry.pending} aria-busy={retry.pending} onClick={() => void retry.fire()}>
          {retry.pending ? 'Requesting…' : 'Retry wrap-up'}
        </Button>}
      {retry.error && <span role="alert" className="text-error">{humanError(retry.error)}</span>}
    </div>
  )
}

/** Quién hizo qué, con los avatares del hito 9; la atribución la escribe el servicio al integrar y cerrar. */
export function Attribution({ task }: { task: Task }) {
  const roles = Object.entries(task.attribution ?? {}).filter(([, list]) => list.length)
    .sort(([a], [b]) => roleOrder.indexOf(a) - roleOrder.indexOf(b))
  if (!roles.length) return null
  return (
    <section className="flex flex-col gap-2" aria-label="Who did what">
      <h3 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Who did what</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {roles.map(([role, list]) => (
          <li key={role} className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-muted-foreground">{roleLabel[role] ?? role}</span>
            {list.map((e) => <span key={e.runId} className="inline-flex items-center gap-2">
              <AgentAvatar id={e.runId} provider={e.provider} name={e.agentName} size={24} /><span>{e.agentName}</span>
            </span>)}
          </li>
        ))}
      </ul>
    </section>
  )
}

interface ArchiveIndex { createdAt: string; files: { name: string; size: number; sha256: string }[] }
const kb = (n: number) => n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`

/** Pestaña Archivo de una tarea done: lo preservado y verificado antes de retirar el worktree. */
export function ArchiveTab({ taskId }: { taskId: string }) {
  const { data, error, loading } = useResource<ArchiveIndex>(`/tasks/${encodeURIComponent(taskId)}/archive`, /^task\.done$/)
  if (loading) return <p role="status" className="text-sm text-muted-foreground">Loading archive</p>
  if (error || !data) return <p role="alert" className="text-sm text-error">Couldn't read the archive. {humanError(new Error(error ?? 'unknown_archive'))}</p>
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{data.files.length} files verified with SHA-256.</p>
      <ul className="flex flex-col divide-y divide-subtle rounded-lg border border-subtle">
        {data.files.map((f) => (
          <li key={f.name} className="flex items-center gap-3 px-3 py-2 text-sm">
            <a className="min-w-0 truncate font-mono text-xs underline-offset-2 hover:underline" target="_blank" rel="noreferrer"
              href={authedUrl(`/tasks/${encodeURIComponent(taskId)}/archive/${f.name.split('/').map(encodeURIComponent).join('/')}`)}
              title={`sha256 ${f.sha256}`}>{f.name}</a>
            <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{kb(f.size)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
