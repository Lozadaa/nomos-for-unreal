import { useState } from 'react'
import { Link } from 'react-router'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/** La página única es `/`; el resto de vistas quedan a mano en el panel lateral «Más» (y en ⌘K), no en pestañas. */
export const views = [
  { to: '/', label: 'Inicio', hint: 'Lo importante de un vistazo' },
  { to: '/produccion', label: 'Todas las tareas', hint: 'La lista completa, con filtros y búsqueda' },
  { to: '/aprobar', label: 'Por aprobar', hint: 'Historial de aprobaciones y comentarios' },
  { to: '/decisiones', label: 'Decisiones', hint: 'Todas, también las ya respondidas' },
  { to: '/entregas', label: 'Entregas', hint: 'Capturas, vídeos, modelos e informes' },
  { to: '/catalogo', label: 'Catálogo', hint: 'Assets disponibles para el juego' },
  { to: '/chat', label: 'Chat', hint: 'La conversación a pantalla completa' },
  { to: '/actividad', label: 'Actividad', hint: 'Registro detallado de todo lo que pasa' },
  { to: '/presupuesto', label: 'Presupuesto', hint: 'Gasto y tokens' },
  { to: '/capacidades', label: 'Capacidades', hint: 'Herramientas conectadas' },
  { to: '/estilo', label: 'Estilo', hint: 'Guía visual del juego' },
] as const

export function MoreMenu({ paused, onTogglePause }: { paused?: boolean; onTogglePause?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon-lg" aria-label="Más" onClick={() => setOpen(true)}><Menu className="size-5" /></Button>
      <SheetContent side="right" className="w-80 gap-0 overflow-y-auto">
        <SheetHeader className="px-5 pt-5">
          <SheetTitle>Más</SheetTitle>
          <SheetDescription>Detalles y herramientas</SheetDescription>
        </SheetHeader>
        <nav aria-label="Vistas" className="flex flex-col px-2">
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
            {paused ? 'Reanudar el trabajo' : 'Pausar el trabajo'}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">{paused ? 'Ahora no empieza nada nuevo.' : 'Lo que está a medias termina; no empieza nada nuevo.'}</p>
        </div>}
      </SheetContent>
    </Sheet>
  )
}
