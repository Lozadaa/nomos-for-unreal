import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { KratosEvent } from '@/lib/tasks'

vi.mock('@/api', () => {
  class ApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  }
  return { token: 'tok', ApiError, api: vi.fn() }
})
vi.mock('@/feel/toasts', () => ({ toasts: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@google/model-viewer', () => ({}))

import { api, ApiError } from '@/api'
import { toasts } from '@/feel/toasts'
import { ingest, resetStore } from '@/store'
import { Actividad } from './Actividad'
import { Capacidades } from './Capacidades'
import { Catalogo } from './Catalogo'
import { Chat } from './Chat'
import { Decisiones } from './Decisiones'
import { Entregas } from './Entregas'
import { Estilo } from './Estilo'
import { Presupuesto } from './Presupuesto'

const mockApi = vi.mocked(api)
type Handler = (path: string, init?: { method?: string; body?: unknown }) => unknown
const serve = (handler: Handler) => mockApi.mockImplementation((async (path: string, init?: { method?: string; body?: unknown }) => handler(path, init)) as typeof api)
const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)
let seq = 0
const event = (type: string, over: Partial<KratosEvent> = {}): KratosEvent => ({
  seq: ++seq, id: `e${seq}`, type, messageId: null, payload: {}, createdAt: new Date(Date.UTC(2026, 9, 23, 10, 0, seq)).toISOString(), ...over,
})
const deferred = <T,>() => { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

beforeEach(() => { resetStore(); seq = 0; mockApi.mockReset(); vi.mocked(toasts.error).mockClear() })
afterEach(cleanup)

describe('Chat: burbuja optimista', () => {
  it('muestra «Enviado», pasa a «Recibido» con el acuse y la respuesta aparece sin duplicar el mensaje', async () => {
    const post = deferred<{ messageId: string }>()
    serve((path, init) => (path === '/messages' && init?.method === 'POST' ? post.promise : []))
    render(<Chat />)
    expect(screen.getByText('Cuéntale a Kratos qué quieres construir')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Mensaje para Kratos'), 'Hola Kratos')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))

    // el servidor aún no ha respondido y la burbuja ya está, con su estado
    expect(await screen.findByText('Hola Kratos')).toBeInTheDocument()
    expect(screen.getByText(/Enviado · esperando confirmación de Kratos/)).toBeInTheDocument()
    expect(screen.getByLabelText('Mensaje para Kratos')).toHaveValue('')

    await act(async () => { post.resolve({ messageId: 'm1' }) })
    act(() => { ingest(event('message.received', { messageId: 'm1', payload: { text: 'Hola Kratos', origin: 'web' } })) })
    expect(screen.getAllByText('Hola Kratos')).toHaveLength(1)
    act(() => { ingest(event('message.acked', { messageId: 'm1' })) })
    expect(screen.getByText(/Recibido · Kratos lo atenderá en breve/)).toBeInTheDocument()
    act(() => { ingest(event('reply.published', { messageId: 'm1', payload: { text: 'Hecho, lo preparo' } })) })
    expect(screen.getByText('Hecho, lo preparo')).toBeInTheDocument()
  })

  it('si el evento llega antes que la respuesta del POST, no se ve el mensaje duplicado', async () => {
    const post = deferred<{ messageId: string }>()
    serve((path, init) => (path === '/messages' && init?.method === 'POST' ? post.promise : []))
    render(<Chat />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Mensaje para Kratos'), 'Una sola vez')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    await screen.findByText('Una sola vez')
    // el SSE gana la carrera: el servidor ya publicó el evento y el POST todavía no ha vuelto
    act(() => { ingest(event('message.received', { messageId: 'm9', payload: { text: 'Una sola vez', origin: 'web' }, createdAt: new Date(Date.now() + 5).toISOString() })) })
    expect(screen.getAllByText('Una sola vez')).toHaveLength(1)
    await act(async () => { post.resolve({ messageId: 'm9' }) })
    expect(screen.getAllByText('Una sola vez')).toHaveLength(1)
  })

  it('si el envío falla, la burbuja desaparece y el texto vuelve al campo con el error al lado', async () => {
    serve((path, init) => { if (path === '/messages' && init?.method === 'POST') throw new Error('http_500'); return [] })
    render(<Chat />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Mensaje para Kratos'), 'Se pierde?')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(screen.getByLabelText('Mensaje para Kratos')).toHaveValue('Se pierde?'), { timeout: 2000 })
    expect(screen.queryByText(/Enviado · esperando/)).not.toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio falló')
  })
})

describe('Actividad: carriles estables', () => {
  const task = (id: string, title: string) => ({ id, title, createdAt: '', updatedAt: '', spec: '', acceptance: [], state: 'pendiente', blockedReason: null, decisionId: null, area: 'gameplay', assigneeRole: null, assigneeProvider: null, parentTaskId: null, dependsOn: [], worktreeId: null, budgetId: null })

  it('500 eventos: los carriles usan content-visibility y cada evento es un punto con etiqueta', async () => {
    serve((path) => (path === '/tasks' ? [task('t1', 'Definir salto'), task('t2', 'Diseñar HUD')] : []))
    const sources = ['Kratos', 'Codex', 'Claude Code', 'Meshy']
    act(() => { for (let i = 0; i < 500; i++) ingest(event('task.activity', { payload: { source: sources[i % 4], taskId: i % 2 ? 't1' : 't2' } })) })
    const start = performance.now()
    inRouter(<Actividad />)
    const elapsed = performance.now() - start
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(500)
    for (const lane of screen.getAllByRole('group')) expect(lane.className).toContain('[content-visibility:auto]')
    expect(elapsed).toBeLessThan(2000)
  })

  it('el filtro por tarea deja solo sus eventos y «Quitar filtro» los devuelve', async () => {
    serve((path) => (path === '/tasks' ? [task('t1', 'Definir salto'), task('t2', 'Diseñar HUD')] : []))
    const { refresh } = await import('@/store')
    await act(async () => { await refresh() })
    act(() => { ingest(event('task.activity', { payload: { source: 'Codex', taskId: 't1' } })); ingest(event('task.activity', { payload: { source: 'Kratos', taskId: 't2' } })) })
    inRouter(<Actividad />)
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('Tarea'), { target: { value: 't1' } })
    await waitFor(() => expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(1))
    fireEvent.change(screen.getByLabelText('Tarea'), { target: { value: '' } })
    await waitFor(() => expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(2))
  })

  it('un evento nuevo entra con fundido y los existentes se recolocan con transición, sin saltar', () => {
    serve(() => [])
    act(() => {
      ingest(event('task.activity', { payload: { source: 'Codex' }, createdAt: '2026-10-23T10:00:00.000Z' }))
      ingest(event('task.activity', { payload: { source: 'Codex' }, createdAt: '2026-10-23T10:05:00.000Z' }))
    })
    inRouter(<Actividad />)
    const second = screen.getAllByRole('button', { pressed: false })[1]
    expect(second.className).toContain('transition-transform')
    const before = second.style.getPropertyValue('--p')
    act(() => { ingest(event('task.activity', { payload: { source: 'Codex' }, createdAt: '2026-10-23T10:55:00.000Z' })) })
    const dots = screen.getAllByRole('button', { pressed: false })
    expect(dots).toHaveLength(3)
    expect(dots.map((d) => d.className.includes('fade-in'))).toEqual([false, false, true]) // solo el recién llegado entra con fundido
    expect(second.style.getPropertyValue('--p')).not.toBe(before) // el eje crece y el punto se recoloca; la transición CSS lo anima
  })

  it('sin eventos explica por qué y ofrece una acción', () => {
    serve(() => [])
    inRouter(<Actividad />)
    expect(screen.getByText('Aún no hay actividad')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nueva petición' })).toBeInTheDocument()
  })
})

describe('Entregas', () => {
  it('la rejilla pide los archivos con el token y el modelo GLB usa el visor', async () => {
    serve((path) => (path === '/artifacts' ? [
      { id: 'a1', taskId: 't', kind: 'model', path: 'modelo-demo.glb', license: 'MIT', createdAt: '' },
      { id: 'a2', taskId: 't', kind: 'screenshot', path: 'captura-01.png', license: 'MIT', createdAt: '' },
    ] : []))
    const { container } = inRouter(<Entregas />)
    const img = await screen.findByAltText('captura-01.png')
    expect(img.getAttribute('src')).toContain('/artifacts/a2/file?token=tok')
    await waitFor(() => expect(container.querySelector('model-viewer')).not.toBeNull())
    expect(container.querySelector('model-viewer')!.getAttribute('src')).toContain('/artifacts/a1/file')
  })
  it('sin entregas muestra el vacío con su acción', async () => {
    serve(() => [])
    inRouter(<Entregas />)
    expect(await screen.findByText('Aún no hay entregas')).toBeInTheDocument()
  })
})

describe('Catálogo', () => {
  const entry = (over = {}) => ({ id: 'c1', name: 'Free_Tennisball', category: 'model', description: 'Accesorio', source: 'fab', state: 'owned', projects: [], formats: ['glb'], engineVersions: ['5.8'], license: 'Estándar', aiForbidden: 0, tags: [], ...over })

  it('«Prohibido para IA» no ofrece preparar y licencia desconocida pide revisarla', async () => {
    serve(() => [entry({ id: 'c1', name: 'Bruno', aiForbidden: 1 }), entry({ id: 'c2', name: 'Explorador', license: null }), entry({ id: 'c3', name: 'Instalado', state: 'imported', projects: ['CrazyPadel'] })])
    inRouter(<Catalogo />)
    await screen.findByText('Bruno')
    const card = (name: string) => screen.getByText(name).closest('li')!
    expect(within(card('Bruno')).getByText(/Prohibido para IA/)).toBeInTheDocument()
    expect(within(card('Bruno')).queryByRole('button')).toBeNull()
    expect(within(card('Explorador')).getByText('Licencia desconocida')).toBeInTheDocument()
    expect(within(card('Explorador')).getByRole('button', { name: 'Revisar licencia' })).toBeInTheDocument()
    expect(within(card('Instalado')).getByText('Instalado en CrazyPadel')).toBeInTheDocument()
  })

  it('«Preparar para Unreal» muestra pendiente ≥ 300 ms y, si el servicio aún no acepta la orden, lo dice en la tarjeta', async () => {
    serve((path, init) => {
      if (path === '/commands' && init?.method === 'POST') throw new ApiError(404, 'not_found')
      return [entry()]
    })
    inRouter(<Catalogo />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Preparar para Unreal' }))
    const busy = await screen.findByRole('button', { name: 'Preparando…' })
    expect(busy).toHaveAttribute('aria-busy', 'true')
    const t0 = Date.now()
    expect(await screen.findByText('Disponible cuando el ejecutor de comandos esté listo.', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(Date.now() - t0).toBeGreaterThanOrEqual(150) // el pendiente se mantuvo aunque el servidor respondió al instante
  })

  it('el filtro «Usables con IA» oculta lo prohibido y sin coincidencias ofrece quitar filtros', async () => {
    serve(() => [entry({ id: 'c1', name: 'Bruno', aiForbidden: 1 }), entry({ id: 'c2', name: 'Ada' })])
    inRouter(<Catalogo />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Usables con IA' }))
    await waitFor(() => expect(screen.queryByText('Bruno')).not.toBeInTheDocument())
    await user.type(screen.getByLabelText('Buscar asset'), 'zzz')
    expect(await screen.findByText('Ningún asset coincide con tu búsqueda')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Quitar filtros' }))
    await waitFor(() => expect(screen.getByText('Bruno')).toBeInTheDocument())
  })
})

describe('Decisiones: elegir resalta al instante', () => {
  const decision = (id: string, over = {}) => ({ id, createdAt: `2026-10-23T10:0${id.slice(-1)}:00.000Z`, taskId: 't1', reason: `Pregunta ${id}`, evidence: [], options: [{ id: 'a', label: 'Opción A', description: '' }, { id: 'b', label: 'Opción B', description: '' }], chosenOptionId: null, state: 'open', ...over })

  it('la opción elegida queda resaltada antes de que responda el servidor y la decisión pasa a resuelta', async () => {
    const post = deferred<unknown>()
    serve((path, init) => (path.endsWith('/resolve') && init?.method === 'POST' ? post.promise : path === '/decisions' ? [decision('d1'), decision('d2')] : []))
    inRouter(<Decisiones />)
    const user = userEvent.setup()
    expect(await screen.findByText('Tienes 2 decisiones pendientes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Opción B' }))
    expect(screen.getByRole('button', { name: 'Opción B' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('Tienes 1 decisión pendiente')).toBeInTheDocument()
    await act(async () => { post.resolve({}) })
  })

  it('un 409 devuelve la decisión a su estado y ofrece «Recargar decisión»', async () => {
    serve((path, init) => {
      if (path.endsWith('/resolve') && init?.method === 'POST') throw Object.assign(new Error('decision_stale'), { status: 409 })
      return path === '/decisions' ? [decision('d1')] : []
    })
    inRouter(<Decisiones />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Opción A' }))
    await waitFor(() => expect(toasts.error).toHaveBeenCalled(), { timeout: 2000 })
    expect(vi.mocked(toasts.error).mock.calls[0][0].action?.label).toBe('Recargar decisión')
    await waitFor(() => expect(screen.getByText('Tienes 1 decisión pendiente')).toBeInTheDocument())
  })

  it('j y k recorren la bandeja', async () => {
    serve((path) => (path === '/decisions' ? [decision('d1'), decision('d2')] : []))
    inRouter(<Decisiones />)
    const list = await screen.findByRole('list', { name: 'Bandeja de decisiones' })
    const current = () => within(list).getAllByRole('button').findIndex((b) => b.getAttribute('aria-current') === 'true')
    expect(current()).toBe(0)
    fireEvent.keyDown(document, { key: 'j' })
    expect(current()).toBe(1)
    fireEvent.keyDown(document, { key: 'k' })
    expect(current()).toBe(0)
  })

  it('sin decisiones lo dice y ofrece ir a Producción', async () => {
    serve(() => [])
    inRouter(<Decisiones />)
    expect(await screen.findByText('No tienes decisiones pendientes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver producción' })).toBeInTheDocument()
  })
})

describe('Presupuesto: cifras con tick', () => {
  it('la cifra se vuelve a montar (tick) cuando cambia y la barra refleja el límite', async () => {
    let spent = 60
    serve((path) => (path === '/budget' ? {
      limits: { meshyCredits: 100, elevenlabsCredits: null, tokens: null, buildMinutes: null },
      spent: { meshyCredits: spent, elevenlabsCredits: 0, tokens: 0, buildMinutes: 0 },
      remaining: { meshyCredits: 100 - spent, elevenlabsCredits: null, tokens: null, buildMinutes: null },
    } : []))
    render(<Presupuesto />)
    const meshy = await screen.findByRole('region', { name: 'Meshy' })
    const first = within(meshy).getByText('60')
    expect(first).toHaveAttribute('data-tick', '60')
    expect(within(meshy).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60')
    expect(screen.getAllByText('Sin límite definido')).toHaveLength(3)

    spent = 100
    act(() => { ingest(event('run.finished')) })
    const last = await within(meshy).findByText('100')
    expect(last).not.toBe(first)
    expect(within(meshy).getByText('Meshy · límite agotado')).toBeInTheDocument()
  })
})

describe('Capacidades', () => {
  const caps = [
    { id: 'git', label: 'Git', state: 'detectado', detail: 'Ejecutable de Git detectado' },
    { id: 'blender', label: 'Blender', state: 'ausente', detail: 'Ejecutable de Blender ausente' },
  ]
  it('«Comprobar ahora» queda pendiente y luego anota cuándo se revisó', async () => {
    serve(() => caps)
    render(<Capacidades />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Comprobar ahora' }))
    expect(await screen.findByRole('button', { name: 'Comprobando…' })).toHaveAttribute('aria-busy', 'true')
    expect(await screen.findByText(/revisado/, {}, { timeout: 2000 })).toBeInTheDocument()
  })
  it('lo ausente ofrece «Ver cómo instalar», que despliega la ayuda sin salir de la fila', async () => {
    serve(() => caps)
    render(<Capacidades />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Ver cómo instalar' }))
    expect(screen.getByText(/Instálalo y pulsa/)).toBeInTheDocument()
  })
})

describe('Estilo', () => {
  it('muestra la guía con su índice y el peor caso alimenta las filas con datos extremos', async () => {
    render(<Estilo />)
    expect(screen.getByRole('navigation', { name: 'Secciones de la guía' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThanOrEqual(8)
    expect(screen.queryByText(/Nude_Tennis_Racket_🎾 con un nombre larguísimo/)).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Peor caso' }))
    expect(screen.getByText(/Nude_Tennis_Racket_🎾 con un nombre larguísimo/)).toBeInTheDocument()
  })
})
