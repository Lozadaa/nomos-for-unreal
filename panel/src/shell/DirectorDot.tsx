import type { Status } from '@/api'
import type { Session } from '@/session'
import { cn } from '@/lib/utils'
import { BRAND } from '@/lib/brand'
import type { KratosEvent } from '@/lib/tasks'

export type DirectorState = 'esperando' | 'escuchando' | 'respondiendo' | 'atendiendo' | 'vigilanteCaido' | 'desconectado' | 'sinToken' | 'caducada'

/** `null` = el servicio no respondió; sin sesión válida responde 401 y no está «desconectado». */
/** Hito 10: el director avisó con `director.typing` y aún no respondió ni se le agotó el plazo. */
export function typingActive(events: KratosEvent[]): boolean {
  const typing = new Map<string, boolean>()
  for (const e of events) {
    if (!e.messageId) continue
    if (e.type === 'director.typing') typing.set(e.messageId, true)
    else if (['message.replied', 'reply.published', 'director.typing_timeout'].includes(e.type)) typing.set(e.messageId, false)
  }
  return [...typing.values()].some(Boolean)
}

export function directorState(status: Status | null, session: Session = 'ok', typing = false): DirectorState {
  if (session !== 'ok') return session
  if (!status) return 'desconectado'
  if (typing) return 'respondiendo'
  if (status.listener) return status.pending > 0 ? 'atendiendo' : 'escuchando'
  return status.director ? 'vigilanteCaido' : 'esperando'
}

const look: Record<DirectorState, { dot: string; label: (pending: number) => string }> = {
  esperando: { dot: 'bg-neutral', label: () => 'Esperando a Kratos' },
  escuchando: { dot: 'bg-success k-pulse', label: () => 'Kratos escuchando' },
  respondiendo: { dot: 'bg-info k-pulse', label: () => `${BRAND.short} respondiendo` },
  atendiendo: { dot: 'bg-info', label: (n) => (n > 0 ? `Kratos atendiendo ${n} ${n === 1 ? 'mensaje' : 'mensajes'}` : 'Kratos atendiendo') },
  vigilanteCaido: { dot: 'bg-warning', label: () => 'Vigilante caído' },
  desconectado: { dot: 'bg-error', label: () => 'Servicio desconectado' },
  sinToken: { dot: 'bg-error', label: () => 'Sin sesión · ábrelo desde Kratos' },
  caducada: { dot: 'bg-error', label: () => 'Sesión caducada · ábrelo de nuevo desde Kratos' },
}

export function DirectorDot({ state, pending = 0 }: { state: DirectorState; pending?: number }) {
  const { dot, label } = look[state]
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <span data-testid="director-dot" data-state={state} aria-hidden className={cn('size-2 rounded-full transition-colors duration-(--k-dur-standard)', dot)} />
      {label(pending)}
    </span>
  )
}
