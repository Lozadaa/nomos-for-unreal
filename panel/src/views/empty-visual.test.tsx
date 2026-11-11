import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
vi.mock('@/api', () => ({ token: null, api: vi.fn(), ApiError: class extends Error { status = 0 } }))
vi.mock('@google/model-viewer', () => ({}))
import { api } from '@/api'
import { refresh, resetStore } from '@/store'
import { Produccion } from './Produccion'
import { Actividad } from './Actividad'
import { Entregas } from './Entregas'
import { Catalogo } from './Catalogo'
import { Chat } from './Chat'
import { Decisiones } from './Decisiones'
import { Presupuesto } from './Presupuesto'
import { Capacidades } from './Capacidades'

beforeEach(() => {
  resetStore()
  vi.mocked(api).mockImplementation(async (path) => { if (path === '/budget') throw new Error('unknown_budget'); return [] as never })
})

it.each([
  ['produccion', 'Production', Produccion], ['actividad', 'Activity', Actividad], ['entregas', 'Deliveries', Entregas], ['catalogo', 'Catalog', Catalogo],
  ['chat', 'Chat', Chat], ['decisiones', 'Decisions', Decisiones], ['presupuesto', 'Budget', Presupuesto], ['capacidades', 'Capabilities', Capacidades],
] as const)('%s vacío tiene un icono de 48 px, una frase y una acción', async (view, label, View) => {
  const { container } = render(<MemoryRouter><View /></MemoryRouter>)
  await act(async () => { await refresh() })
  const icon = await screen.findByRole('img', { name: `${label}: empty` })
  expect(icon).toHaveAttribute('width', '48')
  const empty = container.querySelector(`[data-empty-state="${view}"]`)!
  expect(empty.querySelectorAll('p')).toHaveLength(1)
  expect(empty.querySelectorAll('button,a')).toHaveLength(1)
})

it('las acciones de Producción y Chat llevan el foco al compositor correspondiente', async () => {
  const first = render(<MemoryRouter><Produccion /></MemoryRouter>)
  await act(async () => { await refresh() })
  const button = await screen.findByRole('button', { name: 'New request' })
  fireEvent.click(button)
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Request title' })).toHaveFocus())
  first.unmount()
  render(<MemoryRouter><Chat /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Write a message' }))
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message for Nomos' })).toHaveFocus())
})

it('un presupuesto inexistente ofrece definir un límite utilizable', async () => {
  render(<Presupuesto />)
  const button = await screen.findByRole('button', { name: 'Set limit' })
  fireEvent.click(button)
  const meshy = await screen.findByRole('region', { name: 'Meshy' })
  expect(meshy).toHaveTextContent('No limit set')
  expect(screen.getAllByRole('button', { name: 'Set limit' })).toHaveLength(4)
})
