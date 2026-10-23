import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Layout } from '@/shell/Layout'
import { views } from '@/shell/Tabs'
import { Produccion } from '@/views/Produccion'

function EnConstruccion({ title }: { title: string }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">En construcción</p>
    </section>
  )
}

// Router de datos: <Link viewTransition> y navigate(..., { viewTransition }) lo exigen.
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: views.map((v) =>
      v.to === '/'
        ? { index: true, element: <Produccion /> }
        : { path: v.to.slice(1), element: <EnConstruccion title={v.label} /> }),
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
