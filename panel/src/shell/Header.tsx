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
import { MoreMenu } from './MoreMenu'
import { Search } from 'lucide-react'

/** Cabecera mínima: proyecto y si Nomos escucha a la izquierda; Jugar, Buscar y «Más» a la derecha. */
export function Header({ project, status, onCommand, onTogglePause, play }: { project: string; status: Status | null; onCommand: (from: HTMLButtonElement) => void; onTogglePause?: () => void; pausePending?: boolean; play?: PlayProps }) {
  const session = useSyncExternalStore(onSession, sessionState)
  const typing = useStore((s) => typingActive(s.events))
  const routed = useInRouterContext()
  const state = directorState(status, session, typing)
  const confirmation = status?.lastAckAt ? relativeTime(status.lastAckAt) : 'sin confirmaciones todavía'
  return (
    <header className="flex h-(--k-header) items-center gap-3 border-b border-subtle bg-background px-4 sm:gap-4 sm:px-6">
      <span className="hidden font-semibold tracking-tight sm:inline">{BRAND.short}</span>
      <span aria-hidden className="hidden text-muted-foreground sm:inline">/</span>
      <h1 className="truncate text-sm font-medium">{project}</h1>
      {routed && <ProjectSwitcher />}
      <div data-tour-anchor="director" className="ml-2 hidden md:block">
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0} className="inline-flex rounded-sm" />}>
            <DirectorDot state={state} pending={status?.pending ?? 0} />
          </TooltipTrigger>
          <TooltipContent>Última confirmación: {confirmation}</TooltipContent>
        </Tooltip>
      </div>
      {status?.paused && <span className="hidden items-center gap-2 text-sm text-warning sm:inline-flex" title="No empieza nada nuevo; lo que está a medias termina"><Glyph kind="directorState" value="esperando" tone="warning" />En pausa</span>}
      <div className="ml-auto flex items-center gap-1">
        {play && <div data-tour-anchor="play" className="mr-1 sm:mr-2"><PlayButton {...play} /></div>}
        <Button variant="ghost" size="icon-lg" aria-label="Buscar" title="Buscar (Ctrl+K)" onClick={(event) => onCommand(event.currentTarget)}><Search className="size-5" /></Button>
        {routed && <MoreMenu paused={status ? status.paused : undefined} onTogglePause={onTogglePause} />}
      </div>
    </header>
  )
}
