import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { humanError } from '@/lib/errors'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useFresh } from '@/hooks/fresh'
import { useAction } from '@/feel/useAction'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { AgentAvatar } from '@/visual/art/AgentAvatar'
import { CheckCircle2 } from 'lucide-react'
import { EmptyState } from '@/visual/art/EmptyState'

interface Message { id: string; text: string; at: string; acked: boolean; reply: { text: string; at: string } | null }
interface Outbox { key: string; text: string; sentAt: number; messageId?: string }

/** El servicio no lista mensajes: la conversación se reconstruye de los eventos message.received, message.acked y reply.published. */
function useConversation(): Message[] {
  const events = useStore((s) => s.events)
  return useMemo(() => {
    const messages = new Map<string, Message>()
    for (const e of events) {
      if (!e.messageId) continue
      if (e.type === 'message.received') messages.set(e.messageId, { id: e.messageId, text: String(e.payload.text ?? ''), at: e.createdAt, acked: false, reply: null })
      else if (e.type === 'message.acked') { const m = messages.get(e.messageId); if (m) m.acked = true }
      else if (e.type === 'reply.published') { const m = messages.get(e.messageId); if (m) m.reply = { text: String(e.payload.text ?? ''), at: e.createdAt } }
    }
    return [...messages.values()]
  }, [events])
}

const sentCopy = 'Enviado · esperando confirmación de Kratos'
const receivedCopy = 'Recibido · Kratos lo atenderá en breve'

function Bubble({ text, status, at, from, fresh }: { text: string; status?: string; at?: string; from: 'tu' | 'kratos'; fresh: boolean }) {
  return (
    <li className={cn('flex flex-col gap-1', fresh && 'animate-in duration-(--k-dur-standard) fade-in motion-reduce:animate-none', from === 'tu' ? 'items-end' : 'items-start')}>
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        {from === 'kratos' ? <><AgentAvatar id="kratos" provider="kratos" name="Kratos" size={32} /><span>Kratos</span></> : <span>Tú</span>}
        {at && <time dateTime={at} title={relativeTime(at)}>{relativeTime(at).replace(/^hace /, '')}</time>}
      </span>
      <p className={cn('max-w-[70%] rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap', from === 'tu' ? 'border-subtle bg-card' : 'border-transparent')}>{text}</p>
      {status === receivedCopy ? (
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0} className="inline-flex text-success" />}>
            <CheckCircle2 size={14} role="img" aria-label="Recibido por Kratos" aria-hidden={undefined} />
            <span className="sr-only">{receivedCopy}</span>
          </TooltipTrigger>
          <TooltipContent role="tooltip">{receivedCopy}</TooltipContent>
        </Tooltip>
      ) : status && <span className="text-xs text-muted-foreground">{status}</span>}
    </li>
  )
}

export function Chat() {
  const conversation = useConversation()
  const [outbox, setOutbox] = useState<Outbox[]>([])
  const [text, setText] = useState('')
  const draft = useRef<Outbox>({ key: '', text: '', sentAt: 0 })
  const end = useRef<HTMLLIElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)

  const send = useAction(
    async () => {
      const { key } = draft.current
      const result = await api<{ messageId: string }>('/messages', { method: 'POST', body: { text: draft.current.text } })
      setOutbox((o) => o.map((m) => (m.key === key ? { ...m, messageId: result.messageId } : m)))
    },
    {
      optimistic: () => {
        draft.current = { key: `local-${Date.now()}`, text, sentAt: Date.now() }
        setOutbox((o) => [...o, { ...draft.current }])
        setText('')
        return () => { setOutbox((o) => o.filter((m) => m.key !== draft.current.key)); setText(draft.current.text) }
      },
    },
  )

  // Un envío ya está en la conversación cuando llegó su evento: por messageId o, si el evento gana la carrera al POST, por texto y hora.
  const fresh = useFresh(conversation.flatMap((m) => [m.id, `${m.id}:r`]))
  const known = new Set(conversation.map((m) => m.id))
  const claimed = new Set<string>()
  const waiting = outbox.filter((m) => {
    if (m.messageId && known.has(m.messageId)) return false
    if (m.messageId) return true
    const twin = conversation.find((c) => c.text === m.text && !claimed.has(c.id) && Date.parse(c.at) >= m.sentAt - 2000)
    if (twin) claimed.add(twin.id)
    return !twin
  })
  const count = conversation.length + waiting.length + conversation.filter((m) => m.reply).length

  // la conversación siempre termina a la vista; sin animación de scroll, el recién llegado entra con fundido
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [count])

  const submit = () => { if (text.trim()) void send.fire() }

  return (
    <div className="mx-auto flex h-[calc(100dvh-var(--k-header)-var(--k-tabs)-3rem)] min-h-96 w-full max-w-(--k-prose) flex-col">
      <ul aria-label="Conversación con Kratos" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
        {count === 0 && (
          <li className="m-auto">
            <EmptyState view="chat" action={{ label: 'Escribir mensaje', onClick: () => field.current?.focus() }} />
          </li>
        )}
        {conversation.map((m) => (
          <Fragment key={m.id}>
            <Bubble from="tu" text={m.text} at={m.at} status={m.acked || m.reply ? receivedCopy : sentCopy} fresh={fresh(m.id)} />
            {m.reply && <Bubble from="kratos" text={m.reply.text} at={m.reply.at} fresh={fresh(`${m.id}:r`)} />}
          </Fragment>
        ))}
        {waiting.map((m) => <Bubble key={m.key} from="tu" text={m.text} status={sentCopy} fresh />)}
        <li ref={end} aria-hidden className="h-px" />
      </ul>

      <form
        onSubmit={(e) => { e.preventDefault(); submit() }}
        className="flex flex-col gap-2 border-t border-subtle pt-4"
      >
        <Textarea
          ref={field}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit() } }}
          placeholder="Escribe a Kratos…" name="mensaje" autoComplete="off"
          aria-label="Mensaje para Kratos"
          className="min-h-20"
        />
        <div className="flex items-center gap-3">
          {send.error && <span role="alert" className="text-xs text-error">No se envió. {humanError(send.error)}</span>}
          <span className="ml-auto text-xs text-muted-foreground"><kbd className="font-mono">Ctrl</kbd>+<kbd className="font-mono">Enter</kbd></span>
          <Button type="submit" size="sm" disabled={!text.trim() || send.pending} aria-busy={send.pending}>{send.pending ? 'Enviando…' : 'Enviar'}</Button>
        </div>
      </form>
    </div>
  )
}
