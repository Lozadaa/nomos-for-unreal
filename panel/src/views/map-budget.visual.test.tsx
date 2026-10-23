import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
vi.mock('@/api', () => ({ api: vi.fn(), token: null, ApiError: class extends Error { status = 0 } }))
import { api } from '@/api'
import { refresh, resetStore } from '@/store'
import { Produccion } from './Produccion'
import { Meter, Presupuesto } from './Presupuesto'

beforeEach(() => { resetStore(); vi.mocked(api).mockReset() })
afterEach(() => { delete (document as unknown as { startViewTransition?: unknown }).startViewTransition })

it.each(['Enter', ' '])('filtrar el mapa con teclado (%s) actualiza la URL y las filas sin animación', async (key) => {
  const tasks = ['pendiente', 'probando'].map((state, i) => ({ id: `t${i}`, title: `Petición ${i}`, state, area: 'gameplay', assigneeProvider: null, assigneeRole: null, blockedReason: null, decisionId: null, updatedAt: '', createdAt: '', acceptance: [], spec: '' }))
  vi.mocked(api).mockResolvedValue(tasks)
  const router = createMemoryRouter([{ path: '/', element: <Produccion /> }])
  render(<RouterProvider router={router} />)
  await act(async () => { await refresh() })
  const capture = vi.fn((update: () => void) => { update(); return { finished: Promise.resolve() } })
  Object.assign(document, { startViewTransition: capture })
  fireEvent.keyDown(within(screen.getByRole('group', { name: 'Flujo de producción' })).getByRole('button', { name: 'Probando: 1' }), { key })
  await waitFor(() => expect(router.state.location.search).toContain('etapa=probando'))
  expect(screen.queryByRole('button', { name: /Petición 0/ })).not.toBeInTheDocument()
  expect(capture).not.toHaveBeenCalled()
})

it('el mapa real filtra las filas, conserva URL y alterna al volver a pulsar el nodo', async () => {
  const tasks = ['pendiente', 'probando'].map((state, i) => ({ id: `t${i}`, title: `Petición ${i}`, state, area: 'gameplay', assigneeProvider: null, assigneeRole: null, blockedReason: null, decisionId: null, updatedAt: '', createdAt: '', acceptance: [], spec: '' }))
  vi.mocked(api).mockResolvedValue(tasks)
  const router = createMemoryRouter([{ path: '/', element: <Produccion /> }])
  render(<RouterProvider router={router} />)
  await act(async () => { await refresh() })
  const map = screen.getByRole('group', { name: 'Flujo de producción' })
  const node = within(map).getByRole('button', { name: 'Probando: 1' })
  fireEvent.click(node)
  await waitFor(() => expect(router.state.location.search).toContain('etapa=probando'))
  expect(screen.queryByRole('button', { name: /Petición 0/ })).toBeNull()
  expect(node).toHaveAttribute('aria-pressed', 'true')
  fireEvent.keyDown(node, { key: 'Enter' })
  await waitFor(() => expect(screen.getByRole('button', { name: /Petición 0/ })).toBeInTheDocument())
})

it('cada presupuesto con límite muestra un anillo con porcentaje; sin límite conserva su editor', async () => {
  vi.mocked(api).mockResolvedValue({ scope: 'workspace', scopeId: 'w', limits: { meshyCredits: 100, elevenlabsCredits: 80, tokens: null, buildMinutes: 40 }, spent: { meshyCredits: 60, elevenlabsCredits: 40, tokens: 2, buildMinutes: 10 } })
  render(<Presupuesto />)
  const meshy = await screen.findByRole('region', { name: 'Meshy' })
  expect(within(meshy).getByRole('img', { name: '60 %' })).toHaveTextContent('60%')
  expect(screen.getAllByRole('img')).toHaveLength(3)
  expect(screen.getByRole('button', { name: 'Definir límite' })).toBeInTheDocument()
})

it('un límite cero queda agotado y el editor conserva el borrador si guardar falla', async () => {
  render(<Meter name="Meshy" unit="créditos" spent={0} limit={0} save={async () => { throw new Error('http_500') }} />)
  expect(screen.getByRole('img', { name: '100 %' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Subir límite' }))
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '400' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se guardó'))
  expect(screen.getByRole('spinbutton')).toHaveValue(400)
})

it('guardar o cancelar un límite devuelve el foco al disparador de ese presupuesto', async () => {
  render(<Meter name="Meshy" unit="créditos" spent={1} limit={100} save={async () => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar límite' }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cambiar límite' })).toHaveFocus())
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar límite' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.getByRole('button', { name: 'Cambiar límite' })).toHaveFocus()
})
