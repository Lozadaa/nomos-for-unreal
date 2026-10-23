import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { relativeTime } from '@/lib/time'
import type { Status } from '@/api'
import { DirectorDot, directorState } from './DirectorDot'
import { Glyph } from '@/visual/Glyph'

export function Header({ project, status, onCommand, onTogglePause, pausePending = false }: { project: string; status: Status | null; onCommand: (from: HTMLButtonElement) => void; onTogglePause?: () => void; pausePending?: boolean }) {
  const state = directorState(status)
  const confirmation = status?.lastAckAt ? relativeTime(status.lastAckAt) : 'sin confirmaciones todavía'
  return (
    <header className="flex h-(--k-header) items-center gap-4 border-b border-subtle bg-background px-6">
      <span className="font-semibold tracking-tight">Kratos</span>
      <span aria-hidden className="text-muted-foreground">/</span>
      <h1 className="text-sm font-medium">{project}</h1>
      <div data-tour-anchor="director" className="ml-4">
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0} className="inline-flex rounded-sm" />}>
            <DirectorDot state={state} pending={status?.pending ?? 0} />
          </TooltipTrigger>
          <TooltipContent>Última confirmación: {confirmation}</TooltipContent>
        </Tooltip>
      </div>
      {status?.paused && <span className="inline-flex items-center gap-2 text-sm text-warning" title="Sin arranques nuevos; lo que integra o cierra termina"><Glyph kind="directorState" value="esperando" tone="warning" />Pausado</span>}
      {status && onTogglePause && (
        <Button variant="ghost" size="sm" disabled={pausePending} aria-busy={pausePending} onClick={onTogglePause}>{status.paused ? 'Reanudar' : 'Pausar'}</Button>
      )}
      <Button variant="outline" size="sm" className="ml-auto gap-2 text-muted-foreground" onClick={(event) => onCommand(event.currentTarget)}>
        Buscar
        <kbd className="font-mono text-xs">⌘K</kbd>
      </Button>
    </header>
  )
}
