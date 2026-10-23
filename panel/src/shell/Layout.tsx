import { useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { startLive, useStore } from '@/store'
import { CommandMenu, type TaskRef } from './CommandMenu'
import { Header } from './Header'
import { Tabs } from './Tabs'
import { useStatus } from './useStatus'

export function Layout({ project }: { project?: string }) {
  const status = useStatus()
  const [open, setOpen] = useState(false)
  const tasks: TaskRef[] = useStore((s) => s.tasks)

  // un único canal de eventos para todas las vistas
  useEffect(() => startLive(), [])

  return (
    <TooltipProvider>
      <a href="#contenido" className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:border focus-visible:border-strong focus-visible:bg-background focus-visible:px-3 focus-visible:py-1.5 focus-visible:text-sm">Saltar al contenido</a>
      <Header project={project ?? status?.project?.name ?? 'Proyecto Unreal'} status={status} onCommand={() => setOpen(true)} />
      <Tabs />
      <main id="contenido" tabIndex={-1} className="mx-auto outline-none w-full max-w-(--k-content) p-6">
        <Outlet />
      </main>
      <CommandMenu tasks={tasks} open={open} onOpenChange={setOpen} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
