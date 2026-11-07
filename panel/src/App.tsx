import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Layout } from '@/shell/Layout'
import { views } from '@/shell/MoreMenu'
import { Inicio } from '@/views/Inicio'
import { Produccion } from '@/views/Produccion'
import { Actividad } from '@/views/Actividad'
import { Capacidades } from '@/views/Capacidades'
import { Catalogo } from '@/views/Catalogo'
import { Chat } from '@/views/Chat'
import { Decisiones } from '@/views/Decisiones'
import { Entregas } from '@/views/Entregas'
import { Estilo } from '@/views/Estilo'
import { Presupuesto } from '@/views/Presupuesto'
import { Proyectos } from '@/views/Proyectos'
import { PorAprobar } from '@/views/PorAprobar'

const pages: Record<string, React.ReactElement> = {
  '/': <Inicio />, '/produccion': <Produccion />, '/aprobar': <PorAprobar />, '/actividad': <Actividad />, '/entregas': <Entregas />, '/catalogo': <Catalogo />, '/chat': <Chat />,
  '/decisiones': <Decisiones />, '/presupuesto': <Presupuesto />, '/capacidades': <Capacidades />, '/estilo': <Estilo />,
}

// Router de datos: <Link viewTransition> y navigate(..., { viewTransition }) lo exigen.
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [...views.map((v) => (v.to === '/' ? { index: true, element: pages[v.to] } : { path: v.to.slice(1), element: pages[v.to] })),
      { path: 'proyectos', element: <Proyectos /> }],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
