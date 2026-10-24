import { ChevronDown } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useResource } from '@/hooks/useResource'
import { projectHref, type Project } from '@/views/Proyectos'

/** Junto al nombre del proyecto: los demás juegos con servicio en esta máquina y la portada. Con uno solo, nada. */
export function ProjectSwitcher() {
  const { data } = useResource<Project[]>('/projects')
  const others = (data ?? []).filter((p) => !p.current)
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  // con varios proyectos, la primera vez de la sesión el panel abre la portada para elegir el juego correcto
  useEffect(() => {
    if (!others.length || pathname !== '/' || search) return
    try {
      if (sessionStorage.getItem('kratos.portada')) return
      sessionStorage.setItem('kratos.portada', '1')
    } catch { return }
    void navigate('/proyectos')
  }, [others.length, pathname, search, navigate])
  if (!others.length) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Cambiar de proyecto" />}><ChevronDown /></DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {others.map((p) => (
          <DropdownMenuItem key={`${p.port}-${p.name}`} disabled={!p.alive} render={<a href={projectHref(p)} />}>
            {p.name}{!p.alive && <span className="text-xs text-muted-foreground"> · parado</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/proyectos" />}>Todos los proyectos</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
