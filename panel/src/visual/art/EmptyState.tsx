import { memo } from 'react'
import { catalog, type ArtView } from './catalog'
import { memoSeed } from './seed'

export const EmptyState = memo(function EmptyState({ view }: { view: ArtView }) {
  const art = memoSeed('empty', view, () => catalog[view])
  return (
    <svg width="160" height="120" viewBox="0 0 160 120" role="img" aria-label={`${art.label} sin elementos`} fill="var(--vbg-surface-secondary)" stroke="var(--vbg-border-strong)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={art.empty} />
      <path d={art.accent} fill="none" stroke="var(--vbg-color-info)" />
    </svg>
  )
})
