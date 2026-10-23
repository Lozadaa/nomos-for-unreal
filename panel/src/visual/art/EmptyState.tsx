import { memo } from 'react'
import { catalog, type ArtView, type EmptyAction } from './catalog'

export const EmptyState = memo(function EmptyState({ view, action }: { view: ArtView; action?: EmptyAction }) {
  const { Icon, label, message, action: defaultAction } = catalog[view]
  const next = action ?? defaultAction
  const control = 'rounded-md border border-subtle px-2 py-1 text-xs hover:border-strong focus-visible:outline-2 focus-visible:outline-offset-2'
  return <div className="flex flex-col items-center gap-3 px-3 py-5 text-center">
    <Icon size={48} role="img" aria-label={`${label} sin elementos`} aria-hidden={undefined} className="text-muted-foreground" />
    <p className="text-sm text-muted-foreground">{message}</p>
    {'href' in next ? <a href={next.href} className={control}>{next.label}</a> : <button type="button" className={control} onClick={next.onClick}>{next.label}</button>}
  </div>
})
