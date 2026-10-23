import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Task } from '@/lib/tasks'

vi.mock('@/api', () => ({
  token: null,
  ApiError: class extends Error { status = 0 },
  api: vi.fn(),
}))
import { api } from '@/api'
import { refresh, resetStore } from '@/store'
import { Produccion } from './Produccion'

const mockApi = vi.mocked(api)

const task = (n: number, over: Partial<Task> = {}): Task => ({
  id: `task-${n}0000000`, createdAt: '2026-10-23T10:00:00.000Z', updatedAt: `2026-10-23T10:0${n}:00.000Z`,
  title: `Tarea ${n}`, spec: '', acceptance: [], state: 'pendiente', blockedReason: null, decisionId: null, area: 'gameplay',
  assigneeRole: null, assigneeProvider: null, parentTaskId: null, dependsOn: [], worktreeId: null, budgetId: null, ...over,
})

let server: Task[]
const deferred = <T,>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

async function mount(path = '/') {
  const router = createMemoryRouter([{ path: '/', element: <Produccion /> }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  await act(async () => { await refresh() })
}

beforeEach(() => {
  resetStore()
  server = [task(1), task(2, { state: 'probando', title: 'Probar recorrido' }), task(3, { state: 'probando', title: 'Probar sonido' })]
  mockApi.mockReset()
  mockApi.mockImplementation(async (path: string) => { if (path === '/tasks') return [...server]; throw new Error(`sin simular: ${path}`) })
})
afterEach(cleanup)

describe('Producción: lista viva', () => {
  it('agrupa por etapa con cabeceras y una fila por tarea', async () => {
    await mount()
    expect(screen.getByRole('group', { name: /Pendiente/ })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /Probando/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /, / })).toHaveLength(3)
  })

  it('fila optimista al enviar y sustitución por la tarea real sin duplicarla', async () => {
    const post = deferred<Task>()
    mockApi.mockImplementation((async (path: string, init?: { method?: string }) => {
      if (path === '/tasks' && init?.method === 'POST') return post.promise
      if (path === '/tasks') return [...server]
      throw new Error(path)
    }) as typeof api)
    await mount()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Título de la petición'), 'Habilidad Meteorito')
    await user.click(screen.getByRole('button', { name: 'Enviar a Kratos' }))

    // el servidor todavía no ha respondido: la fila ya está, pendiente y marcada como temporal
    const temp = await screen.findByRole('button', { name: /Habilidad Meteorito/ })
    expect(temp).toHaveAttribute('data-temp')
    expect(within(temp).getByText('enviando')).toBeInTheDocument()
    expect(screen.getByLabelText('Título de la petición')).toHaveValue('')

    // llega la tarea real y, además, su evento ya la había traído a la lista
    const real = task(9, { title: 'Habilidad Meteorito' })
    server.push(real)
    await act(async () => { post.resolve(real); await refresh() })
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Habilidad Meteorito/ })).toHaveLength(1))
    expect(screen.getByRole('button', { name: /Habilidad Meteorito/ })).not.toHaveAttribute('data-temp')
  })

  it('si el servidor rechaza el envío, la fila desaparece y el borrador vuelve junto al control', async () => {
    mockApi.mockImplementation((async (path: string, init?: { method?: string }) => {
      if (path === '/tasks' && init?.method === 'POST') throw new Error('invalid_task')
      return [...server]
    }) as typeof api)
    await mount()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Título de la petición'), 'Se rechaza')
    await user.click(screen.getByRole('button', { name: 'Enviar a Kratos' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Se rechaza/ })).not.toBeInTheDocument(), { timeout: 2000 })
    expect(screen.getByLabelText('Título de la petición')).toHaveValue('Se rechaza')
    expect(await screen.findByText(/El servicio no aceptó los datos/, { selector: '[role="alert"]' })).toBeInTheDocument()
  })

  it('no envía una petición sin título y lo dice junto al campo', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a Kratos' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe un título')
    expect(mockApi.mock.calls.some(([, init]) => (init as { method?: string } | undefined)?.method === 'POST')).toBe(false)
  })

  it('el filtro por etapa deja solo esas filas y volver a pulsarlo las devuelve', async () => {
    await mount()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^Probando/ }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Tarea 1/ })).not.toBeInTheDocument())
    expect(screen.getAllByRole('button', { name: /Probar/ })).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: /^Probando/ })) // desmarca → «Todas»
    await waitFor(() => expect(screen.getByRole('button', { name: /Tarea 1/ })).toBeInTheDocument())
  })

  it('la búsqueda sin resultados explica por qué y ofrece quitar el filtro', async () => {
    await mount()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Buscar tarea'), 'zzzz')
    expect(await screen.findByText('Ninguna tarea coincide con el filtro')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Quitar filtro' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Tarea 1/ })).toBeInTheDocument())
  })

  it('con la producción vacía invita a escribir la primera petición', async () => {
    server = []
    await mount()
    expect(screen.getByText('Escribe la primera petición a Kratos')).toBeInTheDocument()
  })

  it('una tarea bloqueada o en espera de decisión lo dice en texto, no solo en color', async () => {
    server = [task(4, { blockedReason: 'Falta el pack de texturas.' }), task(5, { decisionId: 'd', blockedReason: 'Elegir' }), task(6, { state: 'cerrando', blockedReason: 'Espacio sin retirar' })]
    await mount()
    expect(screen.getByText('Bloqueada')).toBeInTheDocument()
    expect(screen.getByText('Espera decisión')).toBeInTheDocument()
    expect(screen.getByText('No se pudo cerrar')).toBeInTheDocument()
  })
})
