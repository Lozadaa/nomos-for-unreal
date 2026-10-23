import { memo, useEffect, useRef, useState } from 'react'
import { durations, reducedMotion } from '@/feel/motion'
import { catalog, type ArtView } from './catalog'
import { memoSeed } from './seed'

export const ViewHeader = memo(function ViewHeader({ view }: { view: ArtView }) {
  const previous = useRef(view)
  const [arriving, setArriving] = useState(false)
  const d = memoSeed('header', view, () => Array.from({ length: 18 }, (_, n) => `M${n * 80} 0${catalog[view].header}`).join(''))

  useEffect(() => {
    const changed = previous.current !== view
    previous.current = view
    const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
    const stop = () => { if (query?.matches) setArriving(false) }
    query?.addEventListener('change', stop)
    setArriving(changed && !reducedMotion())
    const timer = changed ? setTimeout(() => setArriving(false), durations.standard) : undefined
    return () => { clearTimeout(timer); query?.removeEventListener('change', stop) }
  }, [view])

  return (
    <svg width="1400" height="40" viewBox="0 0 1400 40" preserveAspectRatio="xMinYMid slice" aria-hidden="true" focusable="false" fill="none" stroke="var(--vbg-text-secondary)" strokeWidth="1.5" className="w-full" style={{ opacity: arriving ? 0.14 : 0.08, transition: arriving ? 'opacity var(--k-dur-standard) var(--k-ease)' : undefined }}>
      <path d={d} />
    </svg>
  )
})
