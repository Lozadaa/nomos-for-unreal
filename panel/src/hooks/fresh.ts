import { useRef } from 'react'

/** Claves que aparecen después del primer render: solo ellas entran con fundido (la carga inicial no anima 500 elementos a la vez). */
export function useFresh(keys: (string | number)[]): (key: string | number) => boolean {
  const initial = useRef<Set<string | number> | null>(null)
  initial.current ??= new Set(keys)
  return (key) => !initial.current!.has(key)
}
