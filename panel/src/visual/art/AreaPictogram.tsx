import { memo, type ComponentType, type SVGProps } from 'react'
import { glyphFor } from '../glyphs'
import { memoSeed } from './seed'

export const AreaPictogram = memo(function AreaPictogram({ area, size = 48 }: { area: string; size?: number }) {
  const spec = memoSeed('area', area, () => glyphFor('area', area))
  const Icon = spec.Icon as ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
  return <Icon size={size} strokeWidth={1.5} role="img" aria-label={spec.label} aria-hidden={undefined} style={{ color: 'var(--vbg-text-secondary)' }} />
})
