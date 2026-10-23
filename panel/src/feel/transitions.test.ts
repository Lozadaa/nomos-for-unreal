import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nameFor, queueWhileTransitioning, withViewTransition } from './transitions'

type Doc = { startViewTransition?: unknown }
const doc = document as unknown as Doc

function fakeTransition() {
  let finish!: () => void
  let fail!: (e: unknown) => void
  const finished = new Promise<void>((res, rej) => { finish = res; fail = rej })
  return { finished, finish, fail }
}

describe('transitions', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.useRealTimers(); delete doc.startViewTransition; document.documentElement.className = '' })

  it('sin startViewTransition (Firefox): aplica la actualización, el fundido CSS y resuelve (Review Focus 3)', async () => {
    doc.startViewTransition = undefined
    const update = vi.fn()
    await withViewTransition(update)
    expect(update).toHaveBeenCalledOnce()
    expect(document.documentElement.classList.contains('fallback-fade')).toBe(true)
    await vi.advanceTimersByTimeAsync(180)
    expect(document.documentElement.classList.contains('fallback-fade')).toBe(false)
  })

  it('con startViewTransition lo invoca con la actualización y espera a finished', async () => {
    const t = fakeTransition()
    const spy = vi.fn((cb: () => void) => { cb(); return t })
    doc.startViewTransition = spy
    const update = vi.fn()
    let done = false
    const p = withViewTransition(update).then(() => { done = true })
    await vi.advanceTimersByTimeAsync(0)
    expect(spy).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledOnce()
    expect(done).toBe(false)
    t.finish(); await p
    expect(done).toBe(true)
  })

  it('una transición abortada (finished rechaza) no deja la promesa colgada', async () => {
    const t = fakeTransition()
    doc.startViewTransition = () => t
    const p = withViewTransition(() => {})
    t.fail(new DOMException('skipped', 'AbortError'))
    await expect(p).resolves.toBeUndefined()
  })

  it('queueWhileTransitioning ejecuta tras finished, no antes (Review Focus 1)', async () => {
    const t = fakeTransition()
    doc.startViewTransition = (cb: () => void) => { cb(); return t }
    const p = withViewTransition(() => {})
    const later = vi.fn()
    const q = queueWhileTransitioning(later)
    await vi.advanceTimersByTimeAsync(50)
    expect(later).not.toHaveBeenCalled()
    t.finish(); await p; await q
    expect(later).toHaveBeenCalledOnce()
  })

  it('queueWhileTransitioning ejecuta en el acto si no hay transición', async () => {
    const fn = vi.fn()
    await queueWhileTransitioning(fn)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('nameFor produce identificadores CSS válidos y estables', () => {
    expect(nameFor('task', 'a1b2c3d')).toBe('task-a1b2c3d')
    expect(nameFor('decision', 'x y/1')).toBe('decision-x-y-1')
    expect(nameFor('asset', 'a')).toBe(nameFor('asset', 'a'))
  })
})
