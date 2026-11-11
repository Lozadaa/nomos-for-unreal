import { Fragment, useEffect, useRef, useState } from 'react'
import { humanError } from '@/lib/errors'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useFresh } from '@/hooks/fresh'
import { useNow } from '@/hooks/time'
import { useResource } from '@/hooks/useResource'
import { useAction } from '@/feel/useAction'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { EmptyState } from '@/visual/art/EmptyState'
import { Bubble, CreatedCards, MessageStatus, Typing, type ChatMessage } from './ChatParts'

interface Outbox { key: string; text: string; sentAt: number; messageId?: string }

/** Hito 10: la conversación sale de GET /messages y se vuelve a pedir con cada evento del chat (SSE), sin recargar. */
const live = /^(message\.|director\.typing|task\.created|decision\.opened|worker\.message_sent)/

export function Chat({ className, autoFocus = false }: { className?: string; autoFocus?: boolean } = {}) {
  const { data } = useResource<ChatMessage[]>('/messages', live)
  const conversation = data ?? []
  const tasks = useStore((s) => s.tasks)
  const now = useNow(5000)
  const [outbox, setOutbox] = useState<Outbox[]>([])
  const [text, setText] = useState('')
  const draft = useRef<Outbox>({ key: '', text: '', sentAt: 0 })
  const end = useRef<HTMLLIElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const taskTitle = (id: string) => tasks.find((t) => t.id === id)?.title

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

  // Un envío ya está en la conversación cuando el servicio lo devuelve: por messageId o, si llega antes que el POST, por texto y hora.
  const fresh = useFresh(conversation.flatMap((m) => [m.id, ...m.replies.map((_, i) => `${m.id}:${i}`)]))
  const known = new Set(conversation.map((m) => m.id))
  const claimed = new Set<string>()
  const waiting = outbox.filter((m) => {
    if (m.messageId) return !known.has(m.messageId)
    const twin = conversation.find((c) => c.text === m.text && !claimed.has(c.id) && Date.parse(c.createdAt) >= m.sentAt - 2000)
    if (twin) claimed.add(twin.id)
    return !twin
  })
  const count = conversation.reduce((n, m) => n + 1 + m.replies.length + m.links.length + (m.state === 'respondiendo' ? 1 : 0), waiting.length)

  // al final solo si el usuario ya estaba abajo: si subió a leer, no se le mueve (sin animación de scroll)
  const atBottom = useRef(true)
  // se desplaza la lista, no la página: scrollIntoView arrastraba la ventana entera hasta el chat en móvil
  useEffect(() => { const list = end.current?.parentElement; if (atBottom.current && list) list.scrollTop = list.scrollHeight }, [count])

  const submit = () => { if (text.trim()) void send.fire() }

  return (
    <div className={cn('mx-auto flex h-[calc(100dvh-var(--k-header)-var(--k-tabs)-3rem)] min-h-96 w-full min-w-0 max-w-(--k-prose) flex-col overflow-x-hidden', className)}>
      <ul aria-label={`Conversation with ${BRAND.short}`} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto pb-4"
        onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48 }}>
        {count === 0 && (
          <li className="m-auto">
            <EmptyState view="chat" action={{ label: 'Write a message', onClick: () => field.current?.focus() }} />
          </li>
        )}
        {conversation.map((m) => (
          <Fragment key={m.id}>
            <Bubble from="tu" author={m.from} text={m.text} at={m.createdAt} fresh={fresh(m.id)}><MessageStatus m={m} now={now} /></Bubble>
            {/* en dos tiempos: el acuse corto, lo que se va creando y el cierre */}
            {m.replies.slice(0, 1).map((r) => <Bubble key="0" from="nomos" text={r.text} at={r.at} fresh={fresh(`${m.id}:0`)} taskTitle={taskTitle} />)}
            <CreatedCards links={m.links} tasks={tasks} />
            {m.replies.slice(1).map((r, i) => <Bubble key={i + 1} from="nomos" text={r.text} at={r.at} fresh={fresh(`${m.id}:${i + 1}`)} taskTitle={taskTitle} />)}
            {m.state === 'respondiendo' && <Typing />}
          </Fragment>
        ))}
        {waiting.map((m) => <Bubble key={m.key} from="tu" text={m.text} fresh><span className="text-xs text-muted-foreground">Sending…</span></Bubble>)}
        <li ref={end} aria-hidden className="h-px" />
      </ul>

      <form
        onSubmit={(e) => { e.preventDefault(); submit() }}
        className="flex flex-col gap-2 border-t border-subtle pt-4"
      >
        <Textarea
          ref={field} autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit() } }}
          placeholder={`Message ${BRAND.short}…`} name="mensaje" autoComplete="off"
          aria-label={`Message for ${BRAND.short}`}
          className="min-h-20"
        />
        <div className="flex items-center gap-3">
          {send.error && <span role="alert" className="text-xs text-error">Not sent. {humanError(send.error)}</span>}
          <span className="ml-auto text-xs text-muted-foreground"><kbd className="font-mono">Ctrl</kbd>+<kbd className="font-mono">Enter</kbd></span>
          <Button type="submit" size="sm" disabled={!text.trim() || send.pending} aria-busy={send.pending}
            className="transition-transform duration-(--k-dur-micro) active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100">{send.pending ? 'Sending…' : 'Send'}</Button>
        </div>
      </form>
    </div>
  )
}
