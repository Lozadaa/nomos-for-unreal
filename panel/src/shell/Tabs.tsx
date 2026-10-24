import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

export const views = [
  { to: '/', label: 'Producción' },
  { to: '/actividad', label: 'Actividad' },
  { to: '/entregas', label: 'Entregas' },
  { to: '/catalogo', label: 'Catálogo' },
  { to: '/chat', label: 'Chat' },
  { to: '/decisiones', label: 'Decisiones' },
  { to: '/presupuesto', label: 'Presupuesto' },
  { to: '/capacidades', label: 'Capacidades' },
  { to: '/estilo', label: 'Estilo' },
] as const

export function Tabs() {
  const nav = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const [bar, setBar] = useState({ x: 0, w: 0 })
  const pending = useStore((s) => s.tasks.filter((t) => t.decisionId).length)

  // indicador deslizante bajo la pestaña activa (transición de 180 ms en CSS)
  // se recoloca también cuando una pestaña cambia de ancho (el contador de Decisiones llega después, carga la fuente,
  // cambia la ventana): antes se quedaba bajo la pestaña anterior (hito 10, corrección de Fable)
  useLayoutEffect(() => {
    const place = () => {
      const active = nav.current?.querySelector<HTMLElement>('[aria-current="page"]')
      // sin pestaña activa (la portada de proyectos) no hay subrayado
      const x = active?.offsetLeft ?? 0, w = active?.offsetWidth ?? 0
      setBar((bar) => bar.x === x && bar.w === w ? bar : { x, w })
    }
    place()
    if (typeof ResizeObserver === 'undefined' || !nav.current) return
    const observer = new ResizeObserver(place)
    observer.observe(nav.current)
    for (const link of nav.current.querySelectorAll('a')) observer.observe(link)
    return () => observer.disconnect()
  }, [pathname, pending])

  return (
    <nav ref={nav} aria-label="Vistas" className="relative flex h-(--k-tabs) items-stretch gap-1 border-b border-subtle px-6">
      {views.map((v) => (
        <NavLink
          key={v.to}
          to={v.to}
          end={v.to === '/'}
          viewTransition
          className={({ isActive }) =>
            cn('flex items-center px-3 text-sm outline-offset-[-2px] transition-colors duration-(--k-dur-micro)',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {v.label}
          {v.to === '/decisiones' && pending > 0 && <span className="ml-2 font-mono text-xs text-warning" aria-label={`${pending} pendientes`}>{pending}</span>}
        </NavLink>
      ))}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-px w-[100px] origin-left bg-foreground transition-transform duration-(--k-dur-standard) ease-k motion-reduce:duration-75"
        style={{ transform: `translateX(${bar.x}px) scaleX(${bar.w / 100})` }}
      />
    </nav>
  )
}
