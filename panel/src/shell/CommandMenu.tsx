import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { withViewTransition } from '@/feel/transitions'
import { views } from './Tabs'

export interface TaskRef { id: string; title: string }

const typing = (el: Element | null): boolean =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)

/** ⌘K / Ctrl+K: vistas, tareas por título y acciones. No se abre mientras se escribe en un textarea. */
export function CommandMenu({ tasks = [], open: controlled, onOpenChange }: {
  tasks?: TaskRef[]; open?: boolean; onOpenChange?: (open: boolean) => void
}) {
  const [inner, setInner] = useState(false)
  const open = controlled ?? inner
  const navigate = useNavigate()
  const from = useRef<HTMLElement | null>(null)

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

  return (
    <CommandDialog open={open} onOpenChange={set} title="Menú de comandos" description="Busca una vista, una tarea o una acción">
      <Command>
      <CommandInput placeholder="Busca una vista, una tarea o una acción…" />
      <CommandList>
        <CommandEmpty>No hay resultados.</CommandEmpty>
        <CommandGroup heading="Vistas">
          {views.map((v) => <CommandItem key={v.to} onSelect={() => go(v.to)}>{v.label}</CommandItem>)}
        </CommandGroup>
        {tasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tareas">
              {tasks.map((t) => (
                <CommandItem key={t.id} value={`${t.title} ${t.id}`} onSelect={() => go(`/?tarea=${encodeURIComponent(t.id)}`)}>
                  {t.title}<span className="ml-auto font-mono text-xs text-muted-foreground">{t.id.slice(0, 7)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        <CommandGroup heading="Acciones">
          <CommandItem onSelect={() => go('/?nueva=1')}>Nueva petición</CommandItem>
          <CommandItem disabled>Indexar · llega con el ejecutor de comandos</CommandItem>
          <CommandItem disabled>Pausar · llega con el ejecutor de comandos</CommandItem>
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  )
}
