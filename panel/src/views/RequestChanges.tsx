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
      <h3 className={label}>Pedir cambios</h3>
      {task.state === 'done' && (
        <p className="text-sm text-muted-foreground">
          Esta tarea ya está hecha. Tu mensaje abre una continuación con {providerLabel[task.assigneeProvider ?? ''] ?? BRAND.short}, que la hizo.
        </p>
      )}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) { e.preventDefault(); void action.fire() } }}
        placeholder="Qué debería cambiar…" name="cambios" autoComplete="off"
        aria-label="Pedir cambios al responsable"
        className="min-h-20"
      />
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!text.trim() || action.pending} aria-busy={action.pending} onClick={() => void action.fire()}>
          {action.pending ? 'Enviando…' : 'Pedir cambios'}
        </Button>
        {sentText && !action.error && (
          <span role="status" className="text-xs text-muted-foreground">{action.pending ? `Enviado · esperando confirmación de ${BRAND.short}` : `Recibido · ${BRAND.short} lo atenderá en breve`}</span>
        )}
        {action.error && <span role="alert" className="text-xs text-error">No se envió. {humanError(action.error)}</span>}
      </div>
    </section>
  )
}
