import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { relativeTime } from '@/lib/time'
import { useSyncExternalStore } from 'react'
import { useInRouterContext } from 'react-router'
import type { Status } from '@/api'
import { onSession, sessionState } from '@/session'
import { DirectorDot, directorState, typingActive } from './DirectorDot'
import { ProjectSwitcher } from './ProjectSwitcher'
import { Glyph } from '@/visual/Glyph'
import { useStore } from '@/store'
import { BRAND } from '@/lib/brand'
import { PlayButton, type PlayProps } from './PlayButton'

export function Header({ project, status, onCommand, onTogglePause, pausePending = false, play }: { project: string; status: Status | null; onCommand: (from: HTMLButtonElement) => void; onTogglePause?: () => void; pausePending?: boolean; play?: PlayProps }) {
  const session = useSyncExternalStore(onSession, sessionState)
  const typing = useStore((s) => typingActive(s.events))
  const routed = useInRouterContext()
  const state = directorState(status, session, typing)
  const confirmation = status?.lastAckAt ? relativeTime(status.lastAckAt) : 'sin confirmaciones todavía'
  return (
    <header className="flex h-(--k-header) items-center gap-4 border-b border-subtle bg-background px-6">
      <span className="font-semibold tracking-tight">{BRAND.short}</span>
      <span aria-hidden className="text-muted-foreground">/</span>
      <h1 className="text-sm font-medium">{project}</h1>
      {routed && <ProjectSwitcher />}
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
      {play && <div data-tour-anchor="play" className="ml-2"><PlayButton {...play} /></div>}
      <Button variant="outline" size="sm" className="ml-auto gap-2 text-muted-foreground" onClick={(event) => onCommand(event.currentTarget)}>
        Buscar
        <kbd className="font-mono text-xs">⌘K</kbd>
      </Button>
    </header>
  )
}
