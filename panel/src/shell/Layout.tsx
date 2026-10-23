import { useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { api } from '@/api'
import { CommandMenu, type TaskRef } from './CommandMenu'
import { Header } from './Header'
import { Tabs } from './Tabs'
import { useStatus } from './useStatus'

export function Layout({ project = 'Proyecto Unreal' }: { project?: string }) {
  const status = useStatus()
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<TaskRef[]>([])

  // las tareas del ⌘K se piden al abrirlo, no en segundo plano
  useEffect(() => {
    if (open) api<TaskRef[]>('/tasks').then(setTasks, () => setTasks([]))
  }, [open])

  return (
    <TooltipProvider>
      <Header project={project} status={status} onCommand={() => setOpen(true)} />
      <Tabs />
      <main className="mx-auto w-full max-w-(--k-content) p-6">
        <Outlet />
      </main>
      <CommandMenu tasks={tasks} open={open} onOpenChange={setOpen} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
