import { describe, expect, it, vi } from 'vitest'
import { jitter, memoSeed, pick, rng } from './seed'

describe('semillas del taller', () => {
  it('usa FNV-1a seguido de mulberry32 y repite la secuencia', () => {
    const random = rng('hello')
    expect([random(), random(), random()]).toEqual([0.6311965801287442, 0.7983490515034646, 0.30862852558493614])
    const first = rng('codex-1'), same = rng('codex-1'), other = rng('codex-2')
    const values = Array.from({ length: 12 }, () => first())
    expect(values).toEqual(Array.from({ length: 12 }, () => same()))
    expect(values).not.toEqual(Array.from({ length: 12 }, () => other()))
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
  })

  it('elige y desplaza sin salir de los límites geométricos', () => {
    expect(pick(() => 0, ['a', 'b', 'c'])).toBe('a')
    expect(pick(() => 0.99, ['a', 'b', 'c'])).toBe('c')
    expect(() => pick(rng('empty'), [])).toThrow()
    expect(jitter(() => 0, 10, 3)).toBe(7)
    expect(jitter(() => 0.5, 10, 3)).toBe(10)
    expect(jitter(() => 1, 10, 3)).toBe(13)
  })

  it('memoiza por espacio y semilla sin mantener una caché ilimitada', () => {
    const generate = vi.fn(() => ({ shape: 'triangle' }))
    const first = memoSeed('test/avatar', 'same', generate)
    expect(memoSeed('test/avatar', 'same', generate)).toBe(first)
    expect(generate).toHaveBeenCalledOnce()
    expect(memoSeed('test/header', 'same', generate)).not.toBe(first)
    expect(memoSeed('a', 'bc', generate)).not.toBe(memoSeed('ab', 'c', generate))
    for (let n = 0; n < 300; n++) memoSeed('test/fill', String(n), () => n)
    expect(memoSeed('test/avatar', 'same', generate)).not.toBe(first)
  })
})
