import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { NomosEvent } from '@/lib/tasks'

vi.mock('@/api', () => ({ token: null, api: vi.fn(), ApiError: class extends Error { status = 0 } }))
import { api } from '@/api'
import { addOptimistic, ingest, resetStore } from '@/store'
import { Chat } from './Chat'

const id = '6cb4cfe7-f945-496e-9ba3-ecc50cc54107'
const at = (ms: number) => new Date(Date.now() - ms).toISOString()
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
type Message = Record<string, unknown>
const message = (over: Message = {}): Message => ({ id: 'm1', text: 'Crea tres tareas para J1', createdAt: at(30_000), state: 'recibido', readAt: null, typingAt: null,
  repliedAt: null, timedOut: false, replies: [], links: [], ...over })
let seq = 0
const live = (type: string, payload: Record<string, unknown> = {}) => act(() => {
  ingest({ seq: ++seq, id: `e${seq}`, type, messageId: 'm1', payload, createdAt: new Date().toISOString() } as NomosEvent)
})
const show = () => render(<MemoryRouter><TooltipProvider><Chat /></TooltipProvider></MemoryRouter>)

beforeEach(() => { resetStore(); seq = 0; vi.mocked(api).mockReset() })
afterEach(cleanup)

describe('Chat en vivo (hito 10, Tarea 6)', () => {
  it('estados reales con hora: Recibido → Leído por Nomos → escribiendo → respuesta, sin recargar', async () => {
    const sent = message()
    vi.mocked(api).mockResolvedValue([sent])
    show()
    const bubble = (await screen.findByText('Crea tres tareas para J1')).closest('li')!
    expect(within(bubble).getByText(`Received ${hhmm(sent.createdAt as string)}`)).toBeInTheDocument()
    expect(screen.queryByText(/lo atenderá en breve/)).toBeNull()

    const readAt = at(20_000)
    vi.mocked(api).mockResolvedValue([message({ state: 'leido', readAt })])
    live('message.read')
    expect(await within(bubble).findByText(`Read by Nomos ${hhmm(readAt)}`)).toBeInTheDocument()

    vi.mocked(api).mockResolvedValue([message({ state: 'respondiendo', readAt, typingAt: at(5000) })])
    live('director.typing', { messageId: 'm1', since: at(5000) })
    const typing = await screen.findByRole('status', { name: 'Nomos is typing…' })
    expect(within(typing).getByRole('img', { name: /Nomos/ })).toBeInTheDocument()
    expect(typing.querySelectorAll('[data-dot]')).toHaveLength(3)
    for (const dot of typing.querySelectorAll('[data-dot]')) expect(dot).toHaveClass('motion-reduce:animate-none')

    vi.mocked(api).mockResolvedValue([message({ state: 'respondido', readAt, typingAt: at(5000), repliedAt: at(0), replies: [{ text: 'Entendido: creo 3 tareas…', at: at(0) }] })])
    live('message.replied', { text: 'Entendido: creo 3 tareas…' })
    expect(await screen.findByText('Entendido: creo 3 tareas…')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Nomos is typing…' })).toBeNull())
  })

  it('60 s sin acuse: aviso ámbar honesto; tiempo agotado escribiendo: «sigue trabajando»', async () => {
    vi.mocked(api).mockResolvedValue([message({ createdAt: at(61_000) }), message({ id: 'm2', text: 'otra', state: 'leido', readAt: at(200_000), createdAt: at(220_000), timedOut: true })])
    show()
    const late = await screen.findByText("Nomos hasn't read your message yet")
    expect(late).toHaveClass('text-warning')
    expect(screen.getByText('Nomos is still working on your message')).toBeInTheDocument()
  })

  it('lo creado por el mensaje aparece como tarjetas bajo la respuesta, con título y estado, sin uuids; respuestas en Markdown', async () => {
    addOptimistic({ id, title: 'J1.6 Reacción al golpe', area: 'gameplay', state: 'preparada', assigneeRole: 'Gameplay Worker' } as never)
    vi.mocked(api).mockResolvedValue([message({ state: 'respondido', readAt: at(20_000), repliedAt: at(0),
      replies: [{ text: 'Entendido y ya creado. Tareas: 1) J1.6 Reacción al golpe · preparada. 2) J1.7 Dash · preparada.', at: at(1000) }, { text: '**Listo**', at: at(0) }],
      links: [{ kind: 'task', taskId: id, at: at(500) }, { kind: 'decision', taskId: id, decisionId: 'd1', at: at(400) }] })])
    show()
    const cards = await screen.findByRole('list', { name: 'Created from your message' })
    const task = within(cards).getByRole('link', { name: /^J1\.6 Reacción al golpe/ })
    expect(task).toHaveAttribute('href', `/?tarea=${id}`)
    expect(within(task).getByText('Ready')).toBeInTheDocument()
    expect(task.querySelector('[data-tone]')).toHaveAttribute('data-tone', 'neutral')
    expect(within(cards).getByText(/Decision opened/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(id)
    expect([...document.querySelectorAll('ol > li')].map((li) => li.textContent)).toEqual(['J1.6 Reacción al golpe · preparada.', 'J1.7 Dash · preparada.'])
    expect(screen.getByText('Listo').tagName).toBe('STRONG')
  })

  it('el director crea la tarea antes de responder: la tarjeta aparece ya, con el indicador de escritura', async () => {
    addOptimistic({ id, title: 'J1.6 Reacción al golpe', area: 'gameplay', state: 'pendiente' } as never)
    vi.mocked(api).mockResolvedValue([message({ state: 'respondiendo', readAt: at(20_000), typingAt: at(10_000), links: [{ kind: 'task', taskId: id, at: at(5000) }] })])
    show()
    const cards = await screen.findByRole('list', { name: 'Created from your message' })
    expect(within(cards).getByRole('link', { name: /^J1\.6 Reacción al golpe/ })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Nomos is typing…' })).toBeInTheDocument()
  })
})
