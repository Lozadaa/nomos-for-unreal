import { afterEach, describe, expect, it, vi } from 'vitest'
import { durations, easing, reducedMotion } from './motion'

describe('motion', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('fija las duraciones y el easing del plan', () => {
    expect(durations).toEqual({ micro: 120, standard: 180, panel: 220, reorder: 260 })
    expect(easing).toBe('cubic-bezier(.2,.8,.2,1)')
  })
  it('reducedMotion lee prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }))
    expect(reducedMotion()).toBe(true)
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(reducedMotion()).toBe(false)
  })
})
