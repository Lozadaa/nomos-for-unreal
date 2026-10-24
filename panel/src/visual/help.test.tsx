import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'

vi.mock('@/shell/useStatus', () => ({ useStatus: () => null }))
vi.mock('@/store', () => ({ startLive: () => () => {}, useStore: (pick: (s: { tasks: never[]; events: never[] }) => unknown) => pick({ tasks: [], events: [] }) }))
import { Layout } from '@/shell/Layout'

const key = 'nomos.tour.v1'
beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => values.set(name, value),
  })
})

function mount() {
  const router = createMemoryRouter([{ element: <Layout />, children: [{ path: '*', element: <>
    <form data-tour-anchor="composer"><input aria-label="Petición" /></form>
    <section data-tour-anchor="map"><button>Etapa de ejemplo</button></section>
    <textarea aria-label="Mensaje" /><select aria-label="Área"><option>Interfaz</option></select>
    <div contentEditable suppressContentEditableWarning role="textbox" aria-label="Editor" />
    <button>Volver aquí</button>
  </> }] }])
  return render(<RouterProvider router={router} />)
}

it('la primera visita recorre director, compositor y mapa y no repite la guía al montar', async () => {
  const view = mount()
  const guide = await screen.findByRole('dialog', { name: 'Guía de Nomos' })
  expect(guide).toHaveAttribute('data-tour-target', 'director')
  expect(within(guide).getByText('Aquí ves si Nomos escucha')).toBeVisible()
  fireEvent.click(within(guide).getByRole('button', { name: 'Siguiente' }))
  await waitFor(() => expect(guide).toHaveAttribute('data-tour-target', 'composer'))
  expect(within(guide).getByText('Pide algo aquí')).toBeVisible()
  fireEvent.click(within(guide).getByRole('button', { name: 'Siguiente' }))
  await waitFor(() => expect(guide).toHaveAttribute('data-tour-target', 'map'))
  expect(within(guide).getByText('Así avanza el trabajo')).toBeVisible()
  fireEvent.click(within(guide).getByRole('button', { name: 'Terminar' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(localStorage.getItem(key)).toBe('1')
  view.unmount()
  mount()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('Esc descarta la guía desde el primer paso y recuerda la visita', async () => {
  mount()
  const guide = await screen.findByRole('dialog', { name: 'Guía de Nomos' })
  fireEvent.keyDown(guide, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(localStorage.getItem(key)).toBe('1')
})

it('? abre las 38 entradas de la leyenda y Esc restaura el foco', async () => {
  localStorage.setItem(key, '1')
  mount()
  const before = screen.getByRole('button', { name: 'Volver aquí' })
  before.focus()
  fireEvent.keyDown(before, { key: '?' })
  const legend = await screen.findByRole('dialog', { name: 'Leyenda' })
  expect(legend.querySelectorAll('li')).toHaveLength(38)
  fireEvent.keyDown(legend, { key: 'Escape' })
  await waitFor(() => expect(before).toHaveFocus())
})

it.each(['Petición', 'Mensaje', 'Área', 'Editor'])('? permite escribir en %s sin abrir la leyenda', async (label) => {
  localStorage.setItem(key, '1')
  mount()
  const input = screen.getByLabelText(label)
  input.focus()
  fireEvent.keyDown(input, { key: '?' })
  expect(screen.queryByRole('dialog', { name: 'Leyenda' })).not.toBeInTheDocument()
})

it('la paleta permite abrir Leyenda y repetir Ver guía después de la primera visita', async () => {
  localStorage.setItem(key, '1')
  mount()
  const from = screen.getByRole('button', { name: 'Volver aquí' })
  from.focus()
  fireEvent.keyDown(from, { key: 'k', ctrlKey: true })
  fireEvent.click(await screen.findByText('Leyenda', { selector: '[cmdk-item]' }))
  const legend = await screen.findByRole('dialog', { name: 'Leyenda' })
  fireEvent.keyDown(legend, { key: 'Escape' })
  await waitFor(() => expect(from).toHaveFocus())
  fireEvent.keyDown(from, { key: 'k', ctrlKey: true })
  fireEvent.click(await screen.findByText('Ver guía', { selector: '[cmdk-item]' }))
  expect(await screen.findByRole('dialog', { name: 'Guía de Nomos' })).toBeVisible()
})

it('Leyenda desde Buscar devuelve el foco a Buscar al cerrar', async () => {
  localStorage.setItem(key, '1')
  mount()
  const search = screen.getByRole('button', { name: /Buscar/ })
  search.focus()
  fireEvent.click(search)
  fireEvent.click(await screen.findByText('Leyenda', { selector: '[cmdk-item]' }))
  const legend = await screen.findByRole('dialog', { name: 'Leyenda' })
  fireEvent.keyDown(legend, { key: 'Escape' })
  await waitFor(() => expect(search).toHaveFocus())
})
