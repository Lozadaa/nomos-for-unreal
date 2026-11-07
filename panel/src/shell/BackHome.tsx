import { ArrowLeft } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { views } from './MoreMenu'

/** Fuera de la página única, una sola salida: volver a Inicio, con el nombre de la vista en la que estás. */
export function BackHome() {
  const { pathname } = useLocation()
  if (pathname === '/') return null
  const here = views.find((v) => v.to === pathname)?.label
  return <div className="mb-5 flex items-center gap-3">
    <Link to="/" viewTransition className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden />Inicio
    </Link>
    {here && <><span aria-hidden className="text-muted-foreground">/</span><h2 className="text-sm font-medium">{here}</h2></>}
  </div>
}
