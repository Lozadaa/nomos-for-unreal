import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAction } from '@/feel/useAction'
import { withViewTransition } from '@/feel/transitions'
import { humanError } from '@/lib/errors'

/** «Pedir cambios» sobre una tarea done: crea una tarea hija con la atribución anterior y la abre. */
export function ContinueTask({ taskId }: { taskId: string }) {
  const [text, setText] = useState('')
  const navigate = useNavigate()
  const send = useAction(
    () => api<{ taskId: string }>(`/tasks/${encodeURIComponent(taskId)}/continue`, { method: 'POST', body: { text } }),
    { restoreFocus: false, success: ({ taskId: child }) => { void withViewTransition(() => navigate(`/?tarea=${encodeURIComponent(child)}`, { flushSync: true })) } },
  )
  return (
    <div className="flex flex-col gap-3">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Pedir cambios al responsable" placeholder="Pide un ajuste sobre lo entregado…" name="mensaje" autoComplete="off" className="min-h-20" />
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={!text.trim() || send.pending} aria-busy={send.pending} onClick={() => void send.fire()}>
          {send.pending ? 'Enviando…' : 'Pedir cambios al responsable'}
        </Button>
        <span className="text-xs text-muted-foreground">Abre un ajuste con el mismo responsable.</span>
        {send.error && <span role="alert" className="text-xs text-error">No se envió. {humanError(send.error)}</span>}
      </div>
    </div>
  )
}
