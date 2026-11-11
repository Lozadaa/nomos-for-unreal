import { memo } from 'react'
import { useInRouterContext, useNavigate } from 'react-router'
import { withViewTransition } from '@/feel/transitions'
import { useAction } from '@/feel/useAction'
import { catalog, type ArtView, type EmptyAction } from './catalog'

const control = 'rounded-md border border-subtle px-2 py-1 text-xs hover:border-strong focus-visible:outline-2 focus-visible:outline-offset-2'

function CallbackAction({ action }: { action: { label: string; onClick: () => void } }) {
  const run = useAction(async () => action.onClick(), { minPendingMs: 0, restoreFocus: false })
  return <button type="button" className={control} aria-busy={run.pending} disabled={run.pending} onClick={() => void run.fire()}>{action.label}</button>
}

function RoutedAction({ action }: { action: { label: string; href: string } }) {
  const navigate = useNavigate()
  const run = useAction(() => withViewTransition(() => navigate(action.href, { flushSync: true })), { minPendingMs: 0, restoreFocus: false })
  return <a href={action.href} className={control} onClick={(e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    e.preventDefault(); void run.fire()
  }}>{action.label}</a>
}

export const EmptyState = memo(function EmptyState({ view, action, message }: { view: ArtView; action?: EmptyAction; message?: string }) {
  const { Icon, label, message: defaultMessage, action: defaultAction } = catalog[view]
  const routed = useInRouterContext()
  const next = action ?? defaultAction
  return <div data-empty-state={view} className="flex flex-col items-center gap-3 px-3 py-5 text-center">
    <Icon size={48} role="img" aria-label={`${label}: empty`} aria-hidden={undefined} className="text-muted-foreground" />
    <p className="text-sm text-muted-foreground">{message ?? defaultMessage}</p>
    {'href' in next ? routed ? <RoutedAction action={next} /> : <a href={next.href} className={control}>{next.label}</a> : <CallbackAction action={next} />}
  </div>
})
