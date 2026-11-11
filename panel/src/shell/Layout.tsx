import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { api } from '@/api'
import { useAction } from '@/feel/useAction'
import { useCatalogIndexedToast } from '@/hooks/assetCommands'
import { startLive, useStore } from '@/store'
import { CommandMenu, type TaskRef } from './CommandMenu'
import { Header } from './Header'
import { BackHome } from './BackHome'
import { useStatus } from './useStatus'
import { usePlay } from './usePlay'
import { LegendSheet } from '@/visual/LegendSheet'
import { needsTour, Tour } from '@/visual/Tour'
import { BRAND } from '@/lib/brand'

export function Layout({ project }: { project?: string }) {
  const status = useStatus()
  const play = usePlay()
  const [open, setOpen] = useState(false)
  const [guide, setGuide] = useState(needsTour)
  const [legend, setLegend] = useState(false)
  const returnTo = useRef<HTMLElement | null>(null)
  const commandOpener = useRef<HTMLElement | null>(null)
  const showLegend = useCallback((from: HTMLElement | null) => { returnTo.current = from; setLegend(true) }, [])
  const paused = status?.paused ?? false
  const togglePause = useAction(() => api(paused ? '/director/resume' : '/director/pause', { method: 'POST', body: {} }), { success: () => ({ title: paused ? `${BRAND.short} resumed` : `${BRAND.short} paused` }) })
  const all = useStore((s) => s.tasks)
  const tasks: TaskRef[] = all.filter((t) => !t.id.startsWith('tmp-'))

  useCatalogIndexedToast()
  // un único canal de eventos para todas las vistas
  useEffect(() => startLive(), [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
      const editing = (element: Element | null) => element?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')
      if (editing(event.target instanceof Element ? event.target : null) || editing(document.activeElement)) return
      if (guide || legend || open || document.querySelector('[role="dialog"]')) return
      event.preventDefault()
      showLegend(document.activeElement as HTMLElement | null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [guide, legend, open, showLegend])

  return (
    <TooltipProvider>
      <a href="#contenido" className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:border focus-visible:border-strong focus-visible:bg-background focus-visible:px-3 focus-visible:py-1.5 focus-visible:text-sm">Skip to content</a>
      <Header project={project ?? status?.project?.name ?? 'Unreal project'} status={status} onCommand={(from) => { commandOpener.current = from; setOpen(true) }} onTogglePause={() => void togglePause.fire()} pausePending={togglePause.pending} play={play} />
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-(--k-content) px-4 py-5 outline-none sm:px-6">
        <BackHome />
        <Outlet />
      </main>
      <CommandMenu tasks={tasks} open={open} opener={commandOpener.current} onOpenChange={(next) => { if (!next) commandOpener.current = null; setOpen(next) }} paused={status ? paused : undefined} onTogglePause={() => void togglePause.fire()}
        onLegend={showLegend} onGuide={() => setGuide(true)} />
      <LegendSheet open={legend} onOpenChange={setLegend} returnTo={returnTo.current} />
      {guide && <Tour onClose={() => setGuide(false)} />}
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
