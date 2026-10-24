import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { KratosEvent, Run } from '@/lib/tasks'

vi.mock('@/api', () => ({ api: vi.fn() }))

import { api } from '@/api'
import { getSnapshot, ingest, resetStore } from '@/store'
import { useRuns, type LiveRun } from './useRuns'

const mockApi = vi.mocked(api)
const run = (id: string, state: Run['state'] = 'running', waiting = false): LiveRun => ({
  id, taskId: `task-${id}`, role: 'implementacion', provider: 'codex', state,
  startedAt: '2026-10-23T10:00:00.000Z', finishedAt: state === 'running' ? null : '2026-10-23T10:05:00.000Z', summary: null, waiting,
})
const response = (id: string, state: Run['state'] = 'running', waiting = false) => ({ run: run(id, state), latestStatus: { waiting } })
let seq = 0
const event = (type: string, runId?: unknown): KratosEvent => ({
  seq: ++seq, id: `e${seq}`, type, messageId: null, payload: { runId }, createdAt: '2026-10-23T10:00:00.000Z',
})
const runCalls = () => mockApi.mock.calls.filter(([path]) => path.startsWith('/runs/'))
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => { resetStore(); seq = 0; mockApi.mockReset(); mockApi.mockResolvedValue([]) })
afterEach(() => { cleanup(); resetStore() })

describe('useRuns · ejecuciones observadas en los eventos', () => {
  it('descubre ids únicos de cualquier evento y devuelve solamente las ejecuciones leídas de la API', async () => {
    ingest(event('task.activity', 'r1'))
    ingest(event('task.activity', 'r1'))
    ingest(event('worker.output', 'r2'))
    ingest(event('task.activity', null))
    ingest(event('task.activity', 3))
    ingest(event('task.activity', ''))
    const pending = deferred<ReturnType<typeof response>>()
    mockApi.mockImplementation((async (path: string) => path === '/runs/r1' ? pending.promise : response('r2')) as typeof api)
    const { result } = renderHook(() => useRuns())
    await waitFor(() => expect(result.current).toEqual([run('r2')]))
    expect(runCalls().map(([path]) => path)).toEqual(['/runs/r1', '/runs/r2'])
    await act(async () => { pending.resolve(response('r1')) })
    expect(result.current).toEqual([run('r1'), run('r2')])
  })

  it('no repite lecturas por task.activity y solo refresca el run cuyo ciclo cambió', async () => {
    let finished = false
    mockApi.mockImplementation((async (path: string) => response(path.split('/').at(-1)!, finished ? 'done' : 'running')) as typeof api)
    const { result } = renderHook(() => useRuns())
    act(() => { ingest(event('task.activity', 'r1')); ingest(event('task.activity', 'r2')) })
    await waitFor(() => expect(result.current).toHaveLength(2))
    act(() => { for (let i = 0; i < 20; i++) ingest(event('task.activity', 'r1')) })
    expect(runCalls()).toHaveLength(2)
    finished = true
    const finish = event('run.finished', 'r1')
    act(() => { ingest(finish); ingest(event('message.received')) })
    await waitFor(() => expect(result.current.find((r) => r.id === 'r1')?.state).toBe('done'))
    act(() => { ingest(finish) })
    expect(runCalls().map(([path]) => path)).toEqual(['/runs/r1', '/runs/r2', '/runs/r1'])
    expect(result.current.find((r) => r.id === 'r2')?.state).toBe('running')
  })

  it('conserva el lookup al salir el evento inicial de la ventana de 500 y actualiza el mismo id después', async () => {
    mockApi.mockResolvedValue(response('r1'))
    const { result } = renderHook(() => useRuns())
    act(() => { ingest(event('task.activity', 'r1')) })
    await waitFor(() => expect(result.current).toEqual([run('r1')]))
    act(() => { for (let i = 0; i < 501; i++) ingest(event('message.received')) })
    expect(getSnapshot().events.every((e) => e.payload.runId !== 'r1')).toBe(true)
    expect(result.current).toEqual([run('r1')])
    expect(runCalls()).toHaveLength(1)
    mockApi.mockResolvedValue(response('r1', 'done'))
    act(() => { ingest(event('run.finished', 'r1')) })
    await waitFor(() => expect(result.current).toEqual([run('r1', 'done')]))
    expect(runCalls()).toHaveLength(2)
  })

  it('descarta la respuesta inicial atrasada si run.finished llegó mientras se leía', async () => {
    const initial = deferred<ReturnType<typeof response>>()
    const final = deferred<ReturnType<typeof response>>()
    // por ruta: el store también pide /tasks y no debe llevarse la respuesta del run
    const replies = [initial.promise, final.promise]
    mockApi.mockImplementation(((path: string) => path === '/runs/r1' ? replies.shift()! : Promise.resolve([])) as typeof api)
    const { result } = renderHook(() => useRuns())
    act(() => { ingest(event('run.started', 'r1')) })
    await waitFor(() => expect(runCalls()).toHaveLength(1))
    act(() => { ingest(event('run.finished', 'r1')) })
    expect(runCalls()).toHaveLength(1)
    await act(async () => { initial.resolve(response('r1')) })
    expect(result.current).toEqual([])
    await waitFor(() => expect(runCalls()).toHaveLength(2))
    await act(async () => { final.resolve(response('r1', 'done')) })
    expect(result.current).toEqual([run('r1', 'done')])
  })

  it('no inventa un run tras un error y permite releerlo cuando llega otro evento de ciclo', async () => {
    mockApi.mockRejectedValueOnce(new Error('unknown_run'))
    const { result } = renderHook(() => useRuns())
    act(() => { ingest(event('task.activity', 'r1')) })
    await waitFor(() => expect(runCalls()).toHaveLength(1))
    await act(async () => { await Promise.resolve() })
    expect(result.current).toEqual([])
    act(() => { ingest(event('task.activity', 'r1')) })
    expect(runCalls()).toHaveLength(1)
    mockApi.mockResolvedValue(response('r1', 'done'))
    act(() => { ingest(event('run.finished', 'r1')) })
    await waitFor(() => expect(result.current).toEqual([run('r1', 'done')]))
  })

  it('al desmontar deja de observar y no inicia otra petición por una respuesta pendiente', async () => {
    const pending = deferred<ReturnType<typeof response>>()
    mockApi.mockReturnValue(pending.promise)
    const { unmount } = renderHook(() => useRuns())
    act(() => { ingest(event('run.started', 'r1')); ingest(event('run.finished', 'r1')) })
    await waitFor(() => expect(runCalls()).toHaveLength(1))
    unmount()
    await act(async () => { pending.resolve(response('r1')) })
    act(() => { ingest(event('task.activity', 'r2')) })
    expect(runCalls()).toHaveLength(1)
  })

  it('expone waiting solamente desde latestStatus verificado, sin cambiar el estado del run', async () => {
    mockApi.mockResolvedValue(response('r1', 'running', true))
    const { result } = renderHook(() => useRuns())
    act(() => { ingest(event('worker.waiting', 'r1')) })
    await waitFor(() => expect(result.current).toEqual([run('r1', 'running', true)]))
  })

  it('relee waiting y la reanudación de un run conocido sin consultar por toda su salida', async () => {
    mockApi.mockResolvedValue(response('r1'))
    const { result } = renderHook(() => useRuns())
    act(() => { ingest(event('task.activity', 'r1')) })
    await waitFor(() => expect(result.current).toEqual([run('r1')]))
    mockApi.mockResolvedValue(response('r1', 'running', true))
    act(() => { ingest(event('worker.waiting', 'r1')) })
    await waitFor(() => expect(result.current[0]?.waiting).toBe(true))
    mockApi.mockResolvedValue(response('r1'))
    act(() => { ingest(event('worker.output', 'r1')) })
    await waitFor(() => expect(result.current[0]?.waiting).toBe(false))
    act(() => { ingest(event('worker.output', 'r1')) })
    expect(runCalls()).toHaveLength(3)
  })

  it('hito 10: la reproducción del SSE llega a ráfagas; cada run se lee una vez cuando la ráfaga se calma', async () => {
    mockApi.mockImplementation((async (path: string) => response(path.split('/').at(-1)!, 'running', true)) as typeof api)
    const { result } = renderHook(() => useRuns())
    for (let burst = 0; burst < 4; burst++) {
      act(() => { for (const id of ['r1', 'r2', 'r3']) { ingest(event('run.started', id)); ingest(event('worker.output', id)); ingest(event('worker.waiting', id)) } })
    }
    await waitFor(() => expect(result.current).toHaveLength(3))
    await new Promise((done) => setTimeout(done, 400))
    expect(runCalls()).toHaveLength(3)
  })
})
