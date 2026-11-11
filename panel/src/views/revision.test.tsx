import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import type { NomosEvent, Task } from '@/lib/tasks'

vi.mock('@/api', () => {
  class ApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  }
  return { token: 'tok', ApiError, api: vi.fn() }
})
vi.mock('@/feel/toasts', () => ({ toasts: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { api } from '@/api'
import { addOptimistic, confirmOptimistic, getSnapshot, ingest, refresh, resetStore } from '@/store'
import { animateUpdate } from '@/feel/transitions'
import { axis } from './Actividad'
import { Capacidades } from './Capacidades'
import { Catalogo } from './Catalogo'
import { Decisiones } from './Decisiones'
import { Entregas } from './Entregas'
import { Produccion } from './Produccion'

const mockApi = vi.mocked(api)
const serve = (h: (path: string, init?: { method?: string }) => unknown) => mockApi.mockImplementation((async (p: string, i?: { method?: string }) => h(p, i)) as typeof api)
const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, createdAt: '2026-10-23T10:00:00.000Z', updatedAt: '2026-10-23T10:00:00.000Z', title: id, spec: '', acceptance: [], state: 'pendiente',
  blockedReason: null, decisionId: null, area: 'gameplay', assigneeRole: null, assigneeProvider: null, parentTaskId: null, dependsOn: [], worktreeId: null, budgetId: null, ...over,
})
let seq = 0
const event = (type: string): NomosEvent => ({ seq: ++seq, id: `e${seq}`, type, messageId: null, payload: {}, createdAt: new Date().toISOString() })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeEach(() => { resetStore(); seq = 0; mockApi.mockReset(); delete (document as unknown as Record<string, unknown>).startViewTransition; delete (document as unknown as Record<string, unknown>).activeViewTransition })
afterEach(cleanup)

/** Chromium aplica el callback de startViewTransition un rato después de llamarlo; jsdom no tiene la API, así que se imita. */
function deferredViewTransitions(ms = 30) {
  ;(document as unknown as { startViewTransition: unknown }).startViewTransition = (cb: () => void) => ({ finished: new Promise<void>((r) => setTimeout(() => { cb(); r() }, ms)) })
}

describe('revisión final · store con View Transitions diferidas', () => {
  it('la respuesta del POST que llega antes de que se aplique la fila optimista no deja una fila fantasma', async () => {
    serve((p) => (p === '/tasks' ? [task('a')] : []))
    await refresh()
    deferredViewTransitions()
    addOptimistic(task('tmp-1', { title: 'Nueva' }))
    confirmOptimistic('tmp-1', task('real-1', { title: 'Nueva' })) // el POST responde antes que la transición
    await act(async () => { await wait(150) })
    expect(getSnapshot().tasks.map((t) => t.id)).toEqual(['real-1', 'a'])
    await act(async () => { await refresh(); await wait(150) })
    expect(getSnapshot().tasks.some((t) => t.id.startsWith('tmp-'))).toBe(false)
  })
})

describe('revisión final · transiciones del router', () => {
  it('un cambio de lista espera a la transición de navegación en curso en vez de cortarla', async () => {
    let finish!: () => void
    ;(document as unknown as { activeViewTransition: unknown }).activeViewTransition = { finished: new Promise<void>((r) => { finish = r }) }
    const applied = vi.fn()
    const done = animateUpdate(applied)
    await wait(20)
    expect(applied).not.toHaveBeenCalled()
    finish()
    await done
    expect(applied).toHaveBeenCalled()
  })
})

describe('revisión final · Decisiones', () => {
  const decision = (id: string) => ({ id, createdAt: `2026-10-23T10:0${id.slice(-1)}:00.000Z`, taskId: 't1', reason: `Pregunta ${id}`, evidence: [], options: [{ id: 'a', label: 'Opción A', description: '' }, { id: 'b', label: 'Opción B', description: '' }], chosenOptionId: null, state: 'open' })
  it('al elegir en una decisión no salta a otra ni marca su opción', async () => {
    serve((p, i) => (p.endsWith('/resolve') && i?.method === 'POST' ? new Promise(() => {}) : p === '/decisions' ? [decision('d1'), decision('d2')] : []))
    render(<MemoryRouter><Decisiones /></MemoryRouter>)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Opción B' }))
    expect(screen.getByRole('heading', { name: 'Pregunta d1' })).toBeInTheDocument()
    expect(await screen.findByText(/You chose Opción B/)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: /Pregunta d2/ }))
    expect(screen.getAllByRole('button', { name: 'Opción B' })[0]).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('revisión final · useResource', () => {
  it('se vuelve a pedir aunque el evento que interesa no sea el último del bloque', async () => {
    let calls = 0
    serve((p) => { if (p === '/artifacts') calls++; return [] })
    render(<MemoryRouter><Entregas /></MemoryRouter>)
    await screen.findByText('No deliveries yet')
    const before = calls
    act(() => { ingest(event('artifact.created')); ingest(event('director.started')) })
    await waitFor(() => expect(calls).toBeGreaterThan(before), { timeout: 1500 })
  })
})

describe('revisión final · foco tras una acción', () => {
  it('el botón que disparó la acción recupera el foco cuando termina', async () => {
    serve(() => [{ id: 'git', label: 'Git', state: 'detectado', detail: 'ok' }])
    render(<Capacidades />)
    const button = await screen.findByRole('button', { name: 'Check now' })
    button.focus()
    await userEvent.setup().click(button)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check now' })).toHaveFocus(), { timeout: 2000 })
  })
})

describe('revisión final · Producción conserva los filtros al abrir y cerrar un detalle', () => {
  it('abrir una tarea añade ?tarea sin perder ?etapa', async () => {
    serve((p) => (p === '/tasks' ? [task('x1', { state: 'probando', title: 'Probar x' }), task('x2', { title: 'Otra' })] : []))
    const router = createMemoryRouter([{ path: '/', element: <Produccion /> }], { initialEntries: ['/?etapa=probando'] })
    render(<RouterProvider router={router} />)
    await act(async () => { await refresh() })
    await userEvent.setup().click(await screen.findByRole('button', { name: /Probar x/ }))
    await waitFor(() => expect(router.state.location.search).toContain('tarea=x1'))
    expect(router.state.location.search).toContain('etapa=probando')
  })
})

describe('revisión final · Actividad', () => {
  it('el eje empieza en un múltiplo de diez minutos, así que descartar el evento más antiguo no desplaza todo', () => {
    const [min] = axis([Date.parse('2026-10-23T10:03:41.000Z'), Date.parse('2026-10-23T10:47:00.000Z')])
    expect(min % (10 * 60_000)).toBe(0)
    expect(min).toBeLessThanOrEqual(Date.parse('2026-10-23T10:03:41.000Z'))
  })
})

describe('revisión final · Catálogo', () => {
  it('«Revisar licencia» no envía ninguna orden de preparar', async () => {
    const posts: string[] = []
    serve((p, i) => { if (i?.method === 'POST') posts.push(p); return [{ id: 'c2', name: 'Explorador', category: 'model', description: '', source: 'fab', state: 'owned', projects: [], formats: [], engineVersions: [], license: null, aiForbidden: 0, tags: [] }] })
    render(<MemoryRouter><Catalogo /></MemoryRouter>)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Check license' }))
    await wait(400)
    expect(posts).toEqual([])
    expect(screen.getByText(/no license is declared/i)).toBeInTheDocument()
  })
})
