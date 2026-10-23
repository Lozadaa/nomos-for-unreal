import { memo } from 'react'
import { memoSeed } from './seed'
import './art.css'

export const Ring = memo(function Ring({ value, max, size = 48 }: { value: number; max: number; size?: number }) {
  const percent = memoSeed('ring', `${value}:${max}`, () => Number.isFinite(value) && Number.isFinite(max) && max > 0 ? Math.round(Math.min(1, Math.max(0, value / max)) * 100) : 0)
  return <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={`${percent} %`} className="k-ring">
    <circle cx="24" cy="24" r="20" fill="none" stroke="var(--vbg-border-strong)" strokeWidth="2" />
    <circle cx="24" cy="24" r="20" fill="none" stroke="var(--vbg-color-info)" strokeWidth="2" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - percent} transform="rotate(-90 24 24)" />
    <text x="24" y="27" textAnchor="middle" fontSize="10" fill="currentColor">{percent}%</text>
  </svg>
})
