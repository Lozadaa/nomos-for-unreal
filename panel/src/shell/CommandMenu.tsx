import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api } from '@/api'
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { withViewTransition } from '@/feel/transitions'
import { useAction } from '@/feel/useAction'
import { useIndexCatalog } from '@/hooks/assetCommands'
import { views } from './MoreMenu'

export interface TaskRef { id: string; title: string; state?: string }

/** Escribiendo en un campo (salvo la propia búsqueda de la paleta) Ctrl+K no abre ni cierra nada (Review Focus 5). */
const typing = (el: EventTarget | null): boolean => el instanceof Element
  && !!el.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]') && !el.hasAttribute('cmdk-input')

/** Acciones de la tarea abierta en el detalle, con el estado en que el servicio las acepta. */
const taskActions = [
  { label: 'Run checks', path: 'checks', states: ['implementando', 'revisando', 'probando'], done: 'Checks queued' },
  { label: 'Merge', path: 'integrate', states: ['revisando', 'integrando'], done: 'Merge queued' },
  { label: 'Wrap up', path: 'finalize', states: ['cerrando'], done: 'Wrap-up queued' },
] as const

/** ⌘K / Ctrl+K: vistas, tareas por título y acciones. No se abre mientras se escribe en un campo. */
export function CommandMenu({ tasks = [], open: controlled, onOpenChange, paused, onTogglePause, onLegend, onGuide, opener }: {
  tasks?: TaskRef[]; open?: boolean; onOpenChange?: (open: boolean) => void
  /** `undefined` = sin estado del servicio: la acción queda deshabilitada. */
  paused?: boolean; onTogglePause?: () => void
  onLegend?: (returnTo: HTMLElement | null) => void; onGuide?: () => void
  opener?: HTMLElement | null
}) {
  const [inner, setInner] = useState(false)
  const open = controlled ?? inner
  const navigate = useNavigate()
  const from = useRef<HTMLElement | null>(null)
  useEffect(() => { if (open && opener) from.current = opener }, [open, opener])

  const set = useCallback((next: boolean) => {
    if (next) from.current = document.activeElement as HTMLElement | null
    else {
      const el = from.current
      // el diálogo devuelve el foco al cerrar; lo fijamos nosotros para que no dependa de él
      setTimeout(() => el?.isConnected && el.focus(), 0)
    }
    setInner(next)
    onOpenChange?.(next)
  }, [onOpenChange])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return
      if (typing(e.target as Element) || typing(document.activeElement)) return
      e.preventDefault()
      set(!open)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, set])

  const go = (to: string) => { set(false); void withViewTransition(() => navigate(to, { flushSync: true })) }
  const legend = useAction(async () => {
    const returnTo = from.current
    set(false)
    setTimeout(() => onLegend?.(returnTo), 0)
  }, { minPendingMs: 0, restoreFocus: false })
  const guide = useAction(async () => {
    set(false)
    setTimeout(() => onGuide?.(), 0)
  }, { minPendingMs: 0, restoreFocus: false })
  const index = useIndexCatalog()
  const [params] = useSearchParams()
  const current = tasks.find((t) => t.id === params.get('tarea'))
  const chosen = useRef<(typeof taskActions)[number] | null>(null)
  const runTask = useAction(() => api(`/tasks/${encodeURIComponent(current!.id)}/${chosen.current!.path}`, { method: 'POST', body: {} }),
    { success: () => ({ title: chosen.current!.done }), restoreFocus: false })

  return (
    <CommandDialog open={open} onOpenChange={set} title="Command menu" description="Find a view, a task or an action">
      <Command>
      <CommandInput placeholder="Find a view, a task or an action…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Views">
          {views.map((v) => <CommandItem key={v.to} onSelect={() => go(v.to)}>{v.label}</CommandItem>)}
        </CommandGroup>
        {tasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tasks">
              {tasks.map((t) => (
                <CommandItem key={t.id} value={`${t.title} ${t.id}`} onSelect={() => go(`/?tarea=${encodeURIComponent(t.id)}`)}>
                  {t.title}<span className="ml-auto font-mono text-xs text-muted-foreground">{t.id.slice(0, 7)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go('/?nueva=1')}>New request</CommandItem>
          <CommandItem disabled={!onLegend || legend.pending} onSelect={() => void legend.fire()}>Legend</CommandItem>
          <CommandItem disabled={!onGuide || guide.pending} onSelect={() => void guide.fire()}>Show tour</CommandItem>
          <CommandItem disabled={index.pending} onSelect={() => { set(false); void index.fire() }}>Index catalog</CommandItem>
          <CommandItem disabled={paused === undefined || !onTogglePause} onSelect={() => { set(false); onTogglePause?.() }}>{paused ? 'Resume' : 'Pause'}</CommandItem>
        </CommandGroup>
        {current && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Open task: ${current.title}`}>
              {taskActions.map((action) => (
                <CommandItem key={action.path} disabled={runTask.pending || !(action.states as readonly string[]).includes(current.state ?? '')}
                  onSelect={() => { chosen.current = action; set(false); void runTask.fire() }}>{action.label}</CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
      </Command>
    </CommandDialog>
  )
}
