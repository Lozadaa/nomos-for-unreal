import { memo, type ComponentType, type SVGProps } from 'react'
import { glyphFor } from '../glyphs'
import { jitter, memoSeed, pick, rng } from './seed'

function geometry(id: string) {
  const random = rng(id)
  const n = (value: number) => Math.round(value * 10) / 10
  const x = n(jitter(random, 13, 3)), y = n(jitter(random, 12, 3))
  const spread = pick(random, [4, 5, 6]), direction = pick(random, [-1, 1])
  const radius = pick(random, [5, 7, 9]), arcY = n(jitter(random, 13, 2))
  const barY = pick(random, [8, 13, 18]), barX = n(jitter(random, 7, 2))
  return {
    triangle: `M${x} ${y - spread * direction}l${spread} ${spread * 2 * direction}h${-spread * 2}Z`,
    arc: `M${14 - radius} ${arcY}a${radius} ${radius} 0 0 ${direction > 0 ? 1 : 0} ${radius * 2} 0`,
    bar: `M${barX} ${barY}h${pick(random, [6, 10, 13])}`,
    weight: pick(random, [1.5, 2, 3]),
  }
}

/** Tres formas que identifican al agente; el distintivo del proveedor conserva su forma neutral. */
export const AgentAvatar = memo(function AgentAvatar({ id, provider, size = 24 }: { id: string; provider: string; size?: number }) {
  const shape = memoSeed('avatar', id, () => geometry(id))
  const spec = glyphFor('provider', provider)
  const Provider = spec.Icon as ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={`${id} · ${spec.label}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--vbg-text-secondary)' }}>
      <circle cx="14" cy="14" r="12" fill="var(--vbg-surface-secondary)" stroke="var(--vbg-border-strong)" />
      <path data-shape="triangle" d={shape.triangle} stroke="var(--vbg-color-info)" strokeWidth={shape.weight} />
      <path data-shape="arc" d={shape.arc} strokeWidth={shape.weight} />
      <path data-shape="bar" d={shape.bar} strokeWidth={shape.weight + 1} />
      <circle cx="25" cy="25" r="6" fill="var(--vbg-surface-primary)" stroke="var(--vbg-border-strong)" />
      <g transform="translate(20 20)" data-provider={provider}><Provider size={10} aria-hidden="true" /></g>
    </svg>
  )
})
