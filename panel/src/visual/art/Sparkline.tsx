import { memo } from 'react'
import { memoSeed } from './seed'

type Values = readonly number[] | readonly (readonly number[])[]
const finite = (n: number) => Number.isFinite(n) ? n : 0

/** Hasta siete carriles, escala común y 24 muestras equidistantes por carril. */
export const Sparkline = memo(function Sparkline({ values }: { values: Values }) {
  const paths = memoSeed('sparkline', JSON.stringify(values), () => {
    const lanes: readonly (readonly number[])[] = Array.isArray(values[0]) ? values as readonly (readonly number[])[] : [values as readonly number[]]
    const visible = lanes.slice(0, 7)
    let lo = 0, hi = 0
    for (const lane of visible) for (const n of lane) { lo = Math.min(lo, finite(n)); hi = Math.max(hi, finite(n)) }
    return visible.map((lane, row) => {
      const count = Math.min(24, lane.length)
      return Array.from({ length: Math.max(1, count) }, (_, i) => {
        const n = finite(lane[count <= 1 ? 0 : Math.round(i * (lane.length - 1) / (count - 1))] ?? 0)
        const x = count <= 1 ? 2 : Math.round(2 + i * 164 / (count - 1))
        const y = Math.round(row * 18 + 14 - (hi === lo ? 0.5 : (n - lo) / (hi - lo)) * 10)
        return `${i ? 'L' : 'M'}${x} ${y}`
      }).join('')
    })
  })
  return <svg viewBox={`0 0 168 ${Math.max(18, paths.length * 18)}`} role="img" aria-label="Actividad por hora" fill="none" stroke="var(--vbg-color-info)" strokeWidth="1.5">
    {paths.map((d, i) => <path key={i} d={d} />)}
  </svg>
})
