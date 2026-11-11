import { useState } from 'react'
import { Link } from 'react-router'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/** La página única es `/`; el resto de vistas quedan a mano en el panel lateral «Más» (y en ⌘K), no en pestañas. */
export const views = [
  { to: '/', label: 'Home', hint: 'What matters, at a glance' },
  { to: '/produccion', label: 'All tasks', hint: 'The full list, with filters and search' },
  { to: '/aprobar', label: 'Approvals', hint: 'Approval history and comments' },
  { to: '/decisiones', label: 'Decisions', hint: 'All of them, answered ones too' },
  { to: '/entregas', label: 'Deliveries', hint: 'Screenshots, videos, models and reports' },
  { to: '/catalogo', label: 'Catalog', hint: 'Assets available to the game' },
  { to: '/chat', label: 'Chat', hint: 'The conversation, full screen' },
  { to: '/actividad', label: 'Activity', hint: 'Detailed log of everything that happens' },
  { to: '/presupuesto', label: 'Budget', hint: 'Spend and tokens' },
  { to: '/capacidades', label: 'Capabilities', hint: 'Connected tools' },
  { to: '/estilo', label: 'Style', hint: "The game's visual guide" },
] as const

export function MoreMenu({ paused, onTogglePause }: { paused?: boolean; onTogglePause?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon-lg" aria-label="More" onClick={() => setOpen(true)}><Menu className="size-5" /></Button>
      <SheetContent side="right" className="w-80 gap-0 overflow-y-auto">
        <SheetHeader className="px-5 pt-5">
          <SheetTitle>More</SheetTitle>
          <SheetDescription>Details and tools</SheetDescription>
        </SheetHeader>
        <nav aria-label="Views" className="flex flex-col px-2">
          {views.slice(1).map((v) => (
            <Link key={v.to} to={v.to} viewTransition onClick={() => setOpen(false)}
              className="flex flex-col rounded-md px-3 py-2.5 outline-offset-[-2px] transition-colors duration-(--k-dur-micro) hover:bg-card">
              <span className="text-sm font-medium">{v.label}</span>
              <span className="text-xs text-muted-foreground">{v.hint}</span>
            </Link>
          ))}
        </nav>
        {onTogglePause && paused !== undefined && <div className="mt-4 border-t border-subtle p-5">
          <Button variant="outline" className="w-full" onClick={() => { setOpen(false); onTogglePause() }}>
            {paused ? 'Resume work' : 'Pause work'}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">{paused ? 'Nothing new starts right now.' : 'Work in progress finishes; nothing new starts.'}</p>
        </div>}
      </SheetContent>
    </Sheet>
  )
}
