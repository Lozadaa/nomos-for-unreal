import { useRef, useState } from 'react'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAction } from '@/feel/useAction'
import { humanError } from '@/lib/errors'
import { providerLabel, shortId, type Task } from '@/lib/tasks'
import { BRAND } from '@/lib/brand'

const label = 'text-xs font-medium tracking-wider text-muted-foreground uppercase'

export function RequestChanges({ task }: { task: Task }) {
  const [text, setText] = useState('')
  const [sentText, setSentText] = useState<string | null>(null)
  const draft = useRef('')
  const action = useAction(
    () => api('/messages', { method: 'POST', body: { text: `Cambios en «${task.title}» (${shortId(task.id)}): ${draft.current}` } }),
    {
      optimistic: () => { draft.current = text; setSentText(text); setText(''); return () => { setSentText(null); setText(draft.current) } },
    },
  )
  return (
    <section className="flex flex-col gap-2">
      <h3 className={label}>Request changes</h3>
      {task.state === 'done' && (
        <p className="text-sm text-muted-foreground">
          This task is done. Your message opens a follow-up with {providerLabel[task.assigneeProvider ?? ''] ?? BRAND.short}, who built it.
        </p>
      )}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) { e.preventDefault(); void action.fire() } }}
        placeholder="What should change…" name="cambios" autoComplete="off"
        aria-label="Request changes from the owner"
        className="min-h-20"
      />
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!text.trim() || action.pending} aria-busy={action.pending} onClick={() => void action.fire()}>
          {action.pending ? 'Sending…' : 'Request changes'}
        </Button>
        {sentText && !action.error && (
          <span role="status" className="text-xs text-muted-foreground">{action.pending ? `Sent · waiting for ${BRAND.short} to confirm` : `Received · ${BRAND.short} will pick it up shortly`}</span>
        )}
        {action.error && <span role="alert" className="text-xs text-error">Not sent. {humanError(action.error)}</span>}
      </div>
    </section>
  )
}
