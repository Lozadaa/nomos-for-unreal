import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { relativeTime } from '@/lib/time'
import type { Status } from '@/api'
import { DirectorDot, directorState } from './DirectorDot'

export function Header({ project, status, onCommand }: { project: string; status: Status | null; onCommand: () => void }) {
  const state = directorState(status)
  const confirmation = status?.lastAckAt ? relativeTime(status.lastAckAt) : 'sin confirmaciones todavía'
  return (
    <header className="flex h-(--k-header) items-center gap-4 border-b border-subtle bg-background px-6">
      <span className="font-semibold tracking-tight">Kratos</span>
      <span aria-hidden className="text-muted-foreground">/</span>
      <h1 className="text-sm font-medium">{project}</h1>
      <div className="ml-4">
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0} className="inline-flex rounded-sm" />}>
            <DirectorDot state={state} pending={status?.pending ?? 0} />
          </TooltipTrigger>
          <TooltipContent>Última confirmación: {confirmation}</TooltipContent>
        </Tooltip>
      </div>
      <Button variant="outline" size="sm" className="ml-auto gap-2 text-muted-foreground" onClick={onCommand}>
        Buscar
        <kbd className="font-mono text-xs">⌘K</kbd>
      </Button>
    </header>
  )
}
