/** FNV-1a sobre UTF-8 seguido de mulberry32: independiente del reloj y del render. */
export function rng(seed: string): () => number {
  let state = 2166136261
  for (const byte of new TextEncoder().encode(seed)) state = Math.imul(state ^ byte, 16777619)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(random: () => number, list: readonly T[]): T {
  if (!list.length) throw new RangeError('La lista de formas está vacía')
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))]
}

export const jitter = (random: () => number, base: number, amount: number): number => base + (random() * 2 - 1) * amount

const cache = new Map<string, unknown>()

/** Caché FIFO acotada: comparte geometría entre instancias sin retener todas las entidades. */
export function memoSeed<T>(namespace: string, seed: string, generate: () => T): T {
  const key = `${namespace.length}:${namespace}${seed}`
  if (cache.has(key)) return cache.get(key) as T
  const value = generate()
  if (cache.size >= 256) cache.delete(cache.keys().next().value!)
  cache.set(key, value)
  return value
}
