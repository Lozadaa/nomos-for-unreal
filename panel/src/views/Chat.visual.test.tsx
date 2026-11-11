import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@/api', () => ({ token: null, api: vi.fn(), ApiError: class extends Error { status = 0 } }))
import { api } from '@/api'
import { resetStore } from '@/store'
import { Chat } from './Chat'

const at = new Date(Date.now() - 120000).toISOString()

beforeEach(() => { resetStore(); vi.mocked(api).mockReset() })
afterEach(cleanup)

describe('Chat visual', () => {
  it('identifica cada emisor: «Tú» y el avatar de Nomos con su nombre y la hora relativa', async () => {
    vi.mocked(api).mockResolvedValue([{ id: 'm1', text: 'Construye la escena', createdAt: at, state: 'respondido', readAt: at, typingAt: null, repliedAt: at,
      timedOut: false, replies: [{ text: 'Empiezo a prepararla', at }], links: [] }])
    render(<TooltipProvider><Chat /></TooltipProvider>)
    const userBubble = (await screen.findByText('Construye la escena')).closest('li')!
    expect(within(userBubble).getByText('You')).toBeInTheDocument()
    const nomosBubble = screen.getByText('Empiezo a prepararla').closest('li')!
    expect(within(nomosBubble).getByText('Nomos')).toBeInTheDocument()
    expect(within(nomosBubble).getByRole('img', { name: /Nomos/ })).toBeInTheDocument()
    expect(within(nomosBubble).getByText('2 min')).toBeInTheDocument()
  })

  it('hito 27: un mensaje de un compañero del equipo va firmado «Ana (UI)», no «Tú»', async () => {
    vi.mocked(api).mockResolvedValue([{ id: 'm2', text: '¿Me pasas el HUD?', from: 'Ana (UI)', createdAt: at, state: 'recibido', readAt: null, typingAt: null, repliedAt: null,
      timedOut: false, replies: [], links: [] }])
    render(<TooltipProvider><Chat /></TooltipProvider>)
    const bubble = (await screen.findByText('¿Me pasas el HUD?')).closest('li')!
    expect(within(bubble).getByText('Ana (UI)')).toBeInTheDocument()
    expect(within(bubble).queryByText('You')).toBeNull()
  })
})
