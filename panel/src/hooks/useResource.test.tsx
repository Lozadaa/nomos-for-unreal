import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { KratosEvent } from '@/lib/tasks'

vi.mock('@/api', () => ({ api: vi.fn() }))
import { api } from '@/api'
import { ingest, resetStore } from '@/store'
import { useResource } from './useResource'

let seq = 0
const event = (type: string): KratosEvent => ({ seq: ++seq, id: `e${seq}`, type, messageId: null, payload: {}, createdAt: '' })

beforeEach(() => { resetStore(); seq = 0; vi.mocked(api).mockReset() })
afterEach(cleanup)

describe('useResource (hito 10, datos reales de Block Kings)', () => {
  it('una ráfaga continua de eventos no deja la vista cargando: la petición sale durante la ráfaga', async () => {
    vi.mocked(api).mockImplementation((async (path: string) => path === '/budget' ? { ok: true } : []) as typeof api)
    const { result } = renderHook(() => useResource<{ ok: boolean }>('/budget', /^task\./))
    const started = Date.now()
    while (Date.now() - started < 900 && result.current.loading) {
      act(() => { ingest(event('task.activity')) })
      await new Promise((done) => setTimeout(done, 40))
    }
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toEqual({ ok: true })
  })

  it('tras cargar, una ráfaga de eventos pide de nuevo como mucho unas pocas veces', async () => {
    vi.mocked(api).mockResolvedValue([])
    const { result } = renderHook(() => useResource<unknown[]>('/budget', /^task\./))
    await waitFor(() => expect(result.current.loading).toBe(false))
    vi.mocked(api).mockClear()
    for (let i = 0; i < 20; i++) { act(() => { ingest(event('task.activity')) }); await new Promise((done) => setTimeout(done, 20)) }
    await new Promise((done) => setTimeout(done, 300))
    const calls = vi.mocked(api).mock.calls.filter(([path]) => path === '/budget').length
    expect(calls).toBeGreaterThanOrEqual(1)
    expect(calls).toBeLessThanOrEqual(5)
  })
})
