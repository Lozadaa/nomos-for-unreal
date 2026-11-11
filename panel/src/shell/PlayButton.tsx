import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { PlayBuild, PlayInfo } from './usePlay'

/** De qué salió la build: el código de la tarea (J1.6), su título, la comprobación o el paquete que deja el director. */
export function buildSource(build: PlayBuild): string {
  if (build.task) return build.task.code ?? build.task.title
  return build.check ? 'packaging check' : 'director package'
}
const dateTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const buildLabel = (build: PlayBuild, now = Date.now()) =>
  `Build from ${dateTime.format(new Date(build.builtAt))} (${relativeTime(build.builtAt, now)}) · ${buildSource(build)}`

/** Hito 17: si la build es anterior a main (aviso) o no dice de qué commit sale (discreto); al día, nada. */
export function originNote(build: PlayBuild): { text: string; tone: 'warning' | 'muted' } | null {
  if (!build.origin) return { text: 'Unknown origin', tone: 'muted' }
  return build.stale ? { text: "This build doesn't include the latest changes on main", tone: 'warning' } : null
}
// en el tooltip (fondo invertido) el aviso lleva un punto del color de aviso en vez de texto de color: se lee en los dos temas
const Note = ({ build, tip = false }: { build: PlayBuild; tip?: boolean }) => {
  const note = originNote(build)
  if (!note) return null
  if (!tip) return <span className={note.tone === 'warning' ? 'text-warning' : 'text-muted-foreground'}>{note.text}</span>
  return note.tone === 'warning'
    ? <span className="inline-flex items-center gap-1.5 font-medium"><span aria-hidden className="size-2 rounded-full bg-warning" />{note.text}</span>
    : <span className="opacity-70">{note.text}</span>
}

export function elapsed(since: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000)), two = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${two(m)}:${two(s % 60)}`
}

const Triangle = ({ className }: { className?: string }) => (
  <svg aria-hidden viewBox="0 0 16 16" className={cn('size-4', className)}><path d="M4 2.5v11a.5.5 0 0 0 .76.43l9-5.5a.5.5 0 0 0 0-.86l-9-5.5A.5.5 0 0 0 4 2.5Z" fill="currentColor" /></svg>
)
const Square = () => <svg aria-hidden viewBox="0 0 16 16" className="size-3.5"><rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" /></svg>

export interface PlayProps { play: PlayInfo | null; starting?: boolean; onPlay: () => void; onStop: () => void; now: number; className?: string
  /** Sin build, el motivo junto al botón (la cabecera); Producción ya lo dice en su línea. */
  hint?: boolean }

/** «Jugar» (hito 14): lo más visible de la cabecera. Lanza la última build; mientras juega, el mismo botón la detiene. */
export function PlayButton({ play, starting = false, onPlay, onStop, now, className, hint = true }: PlayProps) {
  const build = play?.build ?? null, running = play?.running ?? null
  const state = running ? 'playing' : starting ? 'starting' : build ? 'ready' : 'none'
  const fresh = !!build && (!play?.lastPlayedBuiltAt || build.builtAt > play.lastPlayedBuiltAt)
  const label = running ? `Playing · ${elapsed(running.since, now)} · Stop` : starting ? 'Starting…' : 'Play'
  const tip = running ? 'Click to close the game'
    : build ? <span className="flex flex-col gap-0.5"><span>{buildLabel(build, now)}</span><Note build={build} tip /></span>
    : play?.reason ?? 'Checking the latest build…'
  return (
    <span className="inline-flex items-center gap-3">
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={state === 'none' ? 0 : -1} className={cn('inline-flex rounded-sm', className)} />}>
        <button type="button" data-state={state} data-fresh={String(state === 'ready' && fresh)} aria-label={label}
          aria-busy={starting} disabled={state === 'none'} onClick={running ? onStop : onPlay}
          className={cn('k-play k-display inline-flex h-10 shrink-0 items-center gap-2.5 rounded-sm px-4 text-lg leading-none whitespace-nowrap',
            state === 'playing' ? 'bg-success text-background' : state === 'none' ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground')}>
          {state === 'playing'
            ? <><span aria-hidden className="size-2 rounded-full bg-current k-pulse" /><span>Playing</span>
              <span className="font-mono tabular-nums">{elapsed(running!.since, now)}</span><Square /><span>Stop</span></>
            : <><Triangle className={cn('size-5', starting && 'k-pulse')} /><span>{starting ? 'Starting…' : 'Play'}</span></>}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
    {hint && state === 'none' && play?.reason && <span className="hidden text-xs text-muted-foreground md:inline">{play.reason}</span>}
    </span>
  )
}

/** Producción: la misma información en una línea discreta, con su botón. */
export function LastBuildLine(props: PlayProps) {
  const build = props.play?.build
  return (
    <div className="flex flex-wrap items-center gap-4">
      <PlayButton {...props} hint={false} />
      <p className="text-sm text-muted-foreground">
        {build ? `Latest build: ${relativeTime(build.builtAt, props.now)} · ${buildSource(build)}` : props.play?.reason ?? 'Checking the latest build…'}
      </p>
      {build && <p className="text-sm"><Note build={build} /></p>}
    </div>
  )
}
