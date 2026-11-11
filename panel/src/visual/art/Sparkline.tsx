import { memo } from 'react'
import { memoSeed } from './seed'

export type SparklineLane = { label: string; values: readonly number[] }
const finite = (n: number) => Number.isFinite(n) ? n : 0

/** Datos del consumidor: de uno a siete carriles etiquetados con escala común. */
export const Sparkline = memo(function Sparkline({ title, lanes, hideTitle = false }: { title: string; lanes: readonly SparklineLane[]; hideTitle?: boolean }) {
  if (typeof title !== 'string' || !title.trim()) throw new Error('Sparkline needs a descriptive title')
  if (!Array.isArray(lanes) || lanes.length < 1 || lanes.length > 7) throw new Error('Sparkline needs between 1 and 7 lanes')
  if (lanes.some((lane) => typeof lane.label !== 'string' || !lane.label.trim())) throw new Error('Every lane needs a label')
  const values = lanes.map((lane) => lane.values)
  const paths = memoSeed('sparkline', JSON.stringify(values), () => {
    let lo = 0, hi = 0
    for (const lane of values) for (const n of lane) { lo = Math.min(lo, finite(n)); hi = Math.max(hi, finite(n)) }
    return values.map((lane, row) => {
      const count = Math.min(24, lane.length)
      return Array.from({ length: Math.max(1, count) }, (_, i) => {
        const n = finite(lane[count <= 1 ? 0 : Math.round(i * (lane.length - 1) / (count - 1))] ?? 0)
        const x = count <= 1 ? 2 : Math.round(2 + i * 164 / (count - 1))
        const y = Math.round(row * 18 + 14 - (hi === lo ? 0.5 : (n - lo) / (hi - lo)) * 10)
        return `${i ? 'L' : 'M'}${x} ${y}`
      }).join('')
    })
  })
  return <figure className="min-w-0">
    <figcaption className={hideTitle ? 'sr-only' : 'mb-2 text-xs text-muted-foreground'}>{title}</figcaption>
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-3">
      <ul className="grid items-center text-xs text-muted-foreground" style={{ gridTemplateRows: `repeat(${lanes.length}, 1fr)` }}>
        {lanes.map((lane, i) => <li key={i} className="truncate" title={lane.label}>{lane.label}</li>)}
      </ul>
      <svg viewBox={`0 0 168 ${paths.length * 18}`} role="img" aria-label={title} className="h-full w-full" fill="none" stroke="var(--vbg-color-info)" strokeWidth="1.5">
        {paths.map((d, i) => <path key={i} d={d} />)}
      </svg>
    </div>
  </figure>
})
