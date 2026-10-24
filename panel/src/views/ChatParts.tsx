import { Link } from 'react-router'
import { BRAND } from '@/lib/brand'
import { Markdown } from '@/lib/markdown'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { stageLabel, toneOf, type Task } from '@/lib/tasks'
import { StatusDot } from '@/components/StatusDot'
import { Glyph } from '@/visual/Glyph'
import { AgentAvatar } from '@/visual/art/AgentAvatar'
import { agentName } from '@/visual/art/agentName'

/** Lo que devuelve `GET /messages` (hito 10). */
export interface ChatMessage {
  id: string; text: string; createdAt: string; state: 'recibido' | 'leido' | 'respondiendo' | 'respondido'
  readAt: string | null; typingAt: string | null; repliedAt: string | null; timedOut: boolean
  replies: { text: string; at: string }[]
  links: { kind: 'task' | 'decision' | 'correction'; taskId: string; decisionId?: string; at: string }[]
}

export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
/** Sin acuse en este tiempo, el panel lo dice en ámbar: nunca una frase tranquilizadora falsa. */
export const unreadAfterMs = 60_000

export function Bubble({ text, at, from, fresh, taskTitle, children }: {
  text: string; at?: string; from: 'tu' | 'kratos'; fresh: boolean; taskTitle?: (id: string) => string | undefined; children?: React.ReactNode
}) {
  return (
    <li className={cn('flex min-w-0 flex-col gap-1', fresh && 'animate-in duration-(--k-dur-standard) ease-k fade-in slide-in-from-bottom-1 motion-reduce:animate-none', from === 'tu' ? 'items-end' : 'items-start')}>
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        {from === 'kratos' ? <><AgentAvatar id="kratos" provider="kratos" name={BRAND.short} size={32} /><span>{BRAND.short}</span></> : <span>Tú</span>}
        {at && <time dateTime={at} title={relativeTime(at)}>{relativeTime(at).replace(/^hace /, '')}</time>}
      </span>
      <Markdown text={text} taskTitle={taskTitle} className={cn('max-w-[85%] min-w-0 rounded-lg border px-3 py-2 text-sm', from === 'tu' ? 'border-subtle bg-card' : 'border-transparent')} />
      {children}
    </li>
  )
}

/** Estado real del mensaje del usuario, con la hora de cada paso. */
export function MessageStatus({ m, now }: { m: ChatMessage; now: number }) {
  if (m.state === 'recibido' && now - Date.parse(m.createdAt) > unreadAfterMs) return <span className="text-xs text-warning">{BRAND.short} no ha leído tu mensaje todavía</span>
  if (m.state === 'leido' && m.timedOut) return <span className="text-xs text-warning">{BRAND.short} sigue trabajando en tu mensaje</span>
  const text = m.readAt ? `Leído por ${BRAND.short} ${hhmm(m.readAt)}` : `Recibido ${hhmm(m.createdAt)}`
  // cada cambio de estado entra con un fundido corto (la clave cambia con el texto)
  return <span key={text} className="animate-in text-xs text-muted-foreground duration-(--k-dur-micro) fade-in motion-reduce:animate-none">{text}</span>
}

/** Tres puntos y el avatar mientras el director redacta; con movimiento reducido, quietos. */
export function Typing() {
  return (
    <li role="status" aria-label={`${BRAND.short} está escribiendo…`} className="flex animate-in items-center gap-2 text-xs text-muted-foreground duration-(--k-dur-standard) fade-in motion-reduce:animate-none">
      <span className="k-pulse inline-flex rounded-full"><AgentAvatar id="kratos" provider="kratos" name={BRAND.short} size={32} state="running" /></span>
      <span className="inline-flex gap-1 rounded-lg border border-subtle px-3 py-2" aria-hidden>
        {[0, 1, 2].map((i) => <span key={i} data-dot style={{ animationDelay: `${i * 160}ms` }} className="size-1.5 animate-pulse rounded-full bg-muted-foreground motion-reduce:animate-none" />)}
      </span>
      <span aria-hidden>{BRAND.short} está escribiendo…</span>
    </li>
  )
}

/** Lo que el director creó por este mensaje: tarjetas compactas que abren la tarea o la Decisión. */
export function CreatedCards({ links, tasks }: { links: ChatMessage['links']; tasks: Task[] }) {
  if (!links.length) return null
  return (
    <li className="flex flex-col gap-1">
      <ul aria-label="Creado a partir de tu mensaje" className="grid max-w-[85%] gap-2 sm:grid-cols-2">
        {links.map((link, i) => {
          const task = tasks.find((t) => t.id === link.taskId)
          const title = task?.title ?? 'Tarea'
          const what = link.kind === 'decision' ? 'Decisión abierta' : link.kind === 'correction' ? 'Corrección enviada' : null
          return (
            <li key={`${link.kind}-${link.taskId}-${i}`} className="animate-in duration-(--k-dur-standard) ease-k fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
              <Link to={link.kind === 'decision' ? '/decisiones' : `/?tarea=${encodeURIComponent(link.taskId)}`}
                className="flex items-center gap-3 rounded-lg border border-subtle bg-card px-3 py-2 text-sm transition-colors duration-(--k-dur-micro) hover:border-strong">
                {task && <span aria-hidden className="inline-flex"><Glyph kind="area" value={task.area} /></span>}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{what ? `${what} · ${title}` : title}</span>
                  {task && <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground"><StatusDot tone={toneOf(task)} /><span>{stageLabel[task.state]}</span> · <span>{agentName(task.assigneeRole, task.area)}</span></span>}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </li>
  )
}
