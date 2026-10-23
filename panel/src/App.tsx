import { createBrowserRouter, RouterProvider } from 'react-router'
import { Layout } from '@/shell/Layout'
import { views } from '@/shell/Tabs'

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
        ? { index: true, element: <EnConstruccion title={v.label} /> }
        : { path: v.to.slice(1), element: <EnConstruccion title={v.label} /> }),
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
