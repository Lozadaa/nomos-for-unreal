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
import { ingest, refresh, resetStore } from '@/store'
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
  it('los agentes vivos comparten nombres cortos y ordinal solo si coinciden, con estado real', async () => {
    server = [task(1, { area: 'ui', assigneeProvider: 'codex' }), task(2, { area: 'ui', assigneeProvider: 'opencode' })]
    mockApi.mockImplementation((async (path: string) => path === '/tasks' ? [...server] : {
      run: { id: path.endsWith('r1') ? 'r1' : 'r2', taskId: server[path.endsWith('r1') ? 0 : 1].id, role: 'implementacion', provider: path.endsWith('r1') ? 'codex' : 'opencode', state: 'running', startedAt: '', finishedAt: null, summary: null },
      latestStatus: { waiting: path.endsWith('r2') },
    }) as typeof api)
    for (let i = 1; i <= 2; i++) ingest({ seq: i, id: `e${i}`, type: 'task.activity', messageId: null, payload: { runId: `r${i}` }, createdAt: '' })
    await mount()
    const first = await screen.findByRole('img', { name: 'UI Worker · Codex' })
    const second = await screen.findByRole('img', { name: 'UI Worker 2 · OpenCode' })
    expect(first).toHaveAttribute('data-state', 'running')
    expect(second).toHaveAttribute('data-state', 'waiting')
    expect(first.querySelector('.k-agent-ordinal')).toHaveTextContent('1')
    expect(second.querySelector('.k-agent-ordinal')).toHaveTextContent('2')
  })
  it('hito 27: los despertares del director por evento salen como runs, sin vista nueva', async () => {
    mockApi.mockImplementation((async (path: string) => path === '/tasks' ? [...server] : {
      run: { id: path.slice(-2), taskId: 'director', role: 'director', provider: 'claude', state: path.endsWith('d2') ? 'running' : 'done', startedAt: '', finishedAt: null, summary: null },
      latestStatus: { waiting: false },
    }) as typeof api)
    for (let i = 1; i <= 2; i++) ingest({ seq: i, id: `e${i}`, type: 'run.started', messageId: null, payload: { runId: `d${i}`, taskId: 'director' }, createdAt: '' })
    await mount()
    expect(await screen.findByText(/Director: 2 despertares · en marcha/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /, / })).toHaveLength(3)
  })
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
    await user.click(screen.getByRole('button', { name: 'Enviar a Nomos' }))

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
    await user.click(screen.getByRole('button', { name: 'Enviar a Nomos' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Se rechaza/ })).not.toBeInTheDocument(), { timeout: 2000 })
    expect(screen.getByLabelText('Título de la petición')).toHaveValue('Se rechaza')
    expect(await screen.findByText(/El servicio no aceptó los datos/, { selector: '[role="alert"]' })).toBeInTheDocument()
  })

  it('no envía una petición sin título y lo dice junto al campo', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a Nomos' }))
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
    expect(screen.getByText('Escribe la primera petición a Nomos')).toBeInTheDocument()
  })

  it('una tarea bloqueada o en espera de decisión lo dice en texto, no solo en color', async () => {
    server = [task(4, { blockedReason: 'Falta el pack de texturas.' }), task(5, { decisionId: 'd', blockedReason: 'Elegir' }), task(6, { state: 'cerrando', blockedReason: 'Espacio sin retirar' })]
    await mount()
    expect(screen.getByText('Bloqueada')).toBeInTheDocument()
    expect(screen.getByText('Espera decisión')).toBeInTheDocument()
    expect(screen.getByText('No se pudo cerrar')).toBeInTheDocument()
  })
})

describe('Producción a todo el ancho (hito 10)', () => {
  it('cada fila lleva la miniatura de su última entrega visual; sin entrega, el hueco vacío', async () => {
    mockApi.mockImplementation((async (path: string) => path === '/tasks' ? [...server] : path === '/artifacts' ? [
      { id: 'a-old', taskId: server[0].id, kind: 'screenshot', path: 'old.png', license: null, createdAt: '2026-10-23T09:00:00.000Z' },
      { id: 'a-new', taskId: server[0].id, kind: 'screenshot', path: 'new.png', license: null, createdAt: '2026-10-23T11:00:00.000Z' },
      { id: 'a-log', taskId: server[0].id, kind: 'report', path: 'log.txt', license: null, createdAt: '2026-10-23T12:00:00.000Z' },
    ] : []) as typeof api)
    await mount()
    const thumb = await screen.findByRole('img', { name: 'Última entrega de Tarea 1' })
    expect(thumb.getAttribute('src')).toContain('/artifacts/a-new/file')
    expect(screen.queryByRole('img', { name: 'Última entrega de Probar recorrido' })).toBeNull()
  })
})
