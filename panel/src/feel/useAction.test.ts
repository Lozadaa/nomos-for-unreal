import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

vi.mock('./toasts', () => ({ toasts: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
import { toasts } from './toasts'
import { useAction } from './useAction'

const delay = <T>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms))

describe('useAction', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks() })
  afterEach(() => vi.useRealTimers())

  it('pending es visible al instante y se mantiene ≥ 300 ms aunque el servidor responda en 20 ms', async () => {
    const { result } = renderHook(() => useAction(() => delay(20, 'ok')))
    let fired!: Promise<void>
    act(() => { fired = result.current.fire() })
    expect(result.current.pending).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(20))
    expect(result.current.pending).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(279))
    expect(result.current.pending).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(1))
    await act(async () => { await fired })
    expect(result.current.pending).toBe(false)
  })

  it('con respuesta lenta no añade espera: pending acaba cuando acaba la petición', async () => {
    const { result } = renderHook(() => useAction(() => delay(500, 1)))
    act(() => { void result.current.fire() })
    await act(() => vi.advanceTimersByTimeAsync(499))
    expect(result.current.pending).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(result.current.pending).toBe(false)
  })

  it('aplica lo optimista en el acto y muestra el toast de éxito del spec', async () => {
    const optimistic = vi.fn(() => vi.fn())
    const { result } = renderHook(() => useAction(() => Promise.resolve(7), {
      optimistic, success: (n) => ({ title: `Hecho ${n}`, action: { label: 'Deshacer', onClick: () => {} } }),
    }))
    act(() => { void result.current.fire() })
    expect(optimistic).toHaveBeenCalledOnce()
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(toasts.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hecho 7' }))
  })

  it('sin spec de éxito no hay toast (el resultado ya es visible)', async () => {
    const { result } = renderHook(() => useAction(() => Promise.resolve(1), { success: () => undefined }))
    act(() => { void result.current.fire() })
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(toasts.success).not.toHaveBeenCalled()
  })

  it('en error revierte, guarda el error y ofrece «Reintentar», que vuelve a ejecutar', async () => {
    const revert = vi.fn()
    const run = vi.fn().mockRejectedValueOnce(new Error('caído')).mockResolvedValue('ok')
    const { result } = renderHook(() => useAction(run, { optimistic: () => revert }))
    act(() => { void result.current.fire() })
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(revert).toHaveBeenCalledOnce()
    expect(result.current.error?.message).toBe('caído')
    const spec = vi.mocked(toasts.error).mock.calls[0][0]
    expect(spec.action?.label).toBe('Reintentar')
    await act(async () => { spec.action!.onClick(); await vi.advanceTimersByTimeAsync(300) })
    expect(run).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeNull()
  })

  it('409: revierte, toast «Recargar decisión» y el foco vuelve al control (Review Focus 2)', async () => {
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    const reload = vi.fn()
    const stale = Object.assign(new Error('decision_stale'), { status: 409 })
    const revert = vi.fn()
    const { result } = renderHook(() => useAction(() => Promise.reject(stale), { optimistic: () => revert, reload }))
    act(() => { void result.current.fire() })
    button.blur() // el foco se pierde mientras la acción está pendiente
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(revert).toHaveBeenCalledOnce()
    const spec = vi.mocked(toasts.error).mock.calls[0][0]
    expect(spec.action?.label).toBe('Recargar decisión')
    spec.action!.onClick()
    expect(reload).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(button)
    button.remove()
  })

  it('ignora un segundo fire mientras hay uno pendiente', async () => {
    const run = vi.fn(() => delay(10, 1))
    const { result } = renderHook(() => useAction(run))
    act(() => { void result.current.fire(); void result.current.fire() })
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(run).toHaveBeenCalledOnce()
  })
})
