import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/utils'

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

  // indicador deslizante bajo la pestaña activa (transición de 180 ms en CSS)
  useLayoutEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (active) setBar({ x: active.offsetLeft, w: active.offsetWidth })
  }, [pathname])

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
        </NavLink>
      ))}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-px bg-foreground transition-[transform,width] duration-(--k-dur-standard) ease-k motion-reduce:duration-75"
        style={{ width: bar.w, transform: `translateX(${bar.x}px)` }}
      />
    </nav>
  )
}
