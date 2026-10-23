import type { Status } from '@/api'
import { cn } from '@/lib/utils'

export type DirectorState = 'esperando' | 'escuchando' | 'atendiendo' | 'vigilanteCaido' | 'desconectado'

/** `null` = el servicio no respondió. */
export function directorState(status: Status | null): DirectorState {
  if (!status) return 'desconectado'
  if (status.listener) return status.pending > 0 ? 'atendiendo' : 'escuchando'
  return status.director ? 'vigilanteCaido' : 'esperando'
}

const look: Record<DirectorState, { dot: string; label: (pending: number) => string }> = {
  esperando: { dot: 'bg-neutral', label: () => 'Esperando a Kratos' },
  escuchando: { dot: 'bg-success k-pulse', label: () => 'Kratos escuchando' },
  atendiendo: { dot: 'bg-info', label: (n) => (n > 0 ? `Kratos atendiendo ${n} ${n === 1 ? 'mensaje' : 'mensajes'}` : 'Kratos atendiendo') },
  vigilanteCaido: { dot: 'bg-warning', label: () => 'Vigilante caído' },
  desconectado: { dot: 'bg-error', label: () => 'Servicio desconectado' },
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
