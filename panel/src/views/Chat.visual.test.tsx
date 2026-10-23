import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { KratosEvent } from '@/lib/tasks'

vi.mock('@/api', () => ({ token: null, api: vi.fn(), ApiError: class extends Error { status = 0 } }))
import { ingest, resetStore } from '@/store'
import { Chat } from './Chat'

let seq = 0
const event = (type: string, payload = {}): KratosEvent => ({ seq: ++seq, id: `e${seq}`, type, messageId: 'm1', payload, createdAt: new Date(Date.now() - 120000).toISOString() })

beforeEach(() => { resetStore(); seq = 0 })
afterEach(cleanup)

describe('Chat visual', () => {
  it('identifica cada emisor y abrevia la confirmación cuando llega el acuse real', async () => {
    act(() => {
      ingest(event('message.received', { text: 'Construye la escena' }))
    })
    render(<TooltipProvider><Chat /></TooltipProvider>)
    const userBubble = screen.getByText('Construye la escena').closest('li')!
    expect(within(userBubble).getByText('Tú')).toBeInTheDocument()
    expect(within(userBubble).getByText(/Enviado · esperando confirmación de Kratos/)).toBeInTheDocument()
    expect(within(userBubble).queryByRole('img', { name: 'Recibido por Kratos' })).not.toBeInTheDocument()
    act(() => { ingest(event('message.acked')); ingest(event('reply.published', { text: 'Empiezo a prepararla' })) })
    const kratosBubble = screen.getByText('Empiezo a prepararla').closest('li')!
    expect(within(kratosBubble).getByText('Kratos')).toBeInTheDocument()
    expect(within(kratosBubble).getByRole('img', { name: /Kratos/ })).toBeInTheDocument()
    expect(within(kratosBubble).getByText('2 min')).toBeInTheDocument()
    const ack = within(userBubble).getByRole('img', { name: 'Recibido por Kratos' })
    expect(ack.parentElement).toHaveAttribute('data-base-ui-tooltip-trigger')
    expect(within(userBubble).queryByText(/Enviado · esperando/)).not.toBeInTheDocument()
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); ack.parentElement!.focus() })
    expect(ack.parentElement).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Recibido · Kratos lo atenderá en breve')
  })
})
