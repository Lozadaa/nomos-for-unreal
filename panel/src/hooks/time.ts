import { useEffect, useState } from 'react'

/** Reloj para los «hace 2 min»: se actualiza solo, sin pedir nada al servidor. */
export function useNow(intervalMs = 15000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** Verdadero cuando `active` lleva más de `ms` encendido: los esqueletos solo aparecen si se espera de verdad. */
export function useAfter(active: boolean, ms = 300): boolean {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!active) { setLate(false); return }
    const id = setTimeout(() => setLate(true), ms)
    return () => clearTimeout(id)
  }, [active, ms])
  return active && late
}
