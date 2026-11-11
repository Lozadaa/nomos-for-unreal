import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Approvals } from '@/lib/approvals'

vi.mock('@/api', () => ({ token: 'tok', api: vi.fn(), ApiError: class extends Error {}, markUnauthorized: vi.fn() }))
import { api } from '@/api'
import { resetStore } from '@/store'
import { PorAprobar } from './PorAprobar'

// Hito 22: «una sección por aprobar con imágenes y video por elemento para aprobar y yo viéndolo doy mi opinión o mi cierre»
const art = (id: string, kind: string, path: string, provenance: Record<string, unknown> = {}) =>
  ({ id, kind, path, taskId: 't1', license: null, createdAt: `2026-10-25T10:00:${id}Z`, provenance })
const fixture = (): Approvals => ({ pending: 1, general: [], items: [{
  id: 'a1', taskId: 't1', state: 'pending', createdAt: '2026-10-25T10:00:00Z', title: 'J1.6 Reacciones a los golpes', area: 'gameplay',
  summary: 'Los golpes hacen retroceder al rival.', focus: ['Mira el retroceso al tercer golpe', 'Escucha el impacto'], comments: [],
  evidence: [art('11', 'video', 'C:/k/tests/x/golpe.mp4', { label: 'Animación · golpe', seconds: 4 }),
    art('12', 'screenshot', 'C:/k/tests/x/map-player.png', { check: 'map', view: 'player' })],
}] })
const ids = /[0-9a-f]{8}-[0-9a-f]{4}|\.(png|jpe?g|mp4)\b|C:\//
const mount = () => render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <PorAprobar /> }])} />)

beforeEach(() => {
  cleanup(); resetStore(); vi.mocked(api).mockReset()
  vi.mocked(api).mockImplementation(async (path: string) => (path === '/approvals' ? fixture() : { state: 'approved' }) as never)
})

describe('Por aprobar', () => {
  it('hito 29: un conflicto en un mapa enseña las dos versiones y dos botones; la elección va al servicio', async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path !== '/approvals') return { state: 'approved', choice: 'mine' } as never
      const f = fixture(); f.items[0] = { ...f.items[0], title: 'Arena de Richard', focus: [], conflict: { files: ['Content/Mapas/L_Arena.umap'],
        mine: { who: 'Richard', frente: 'combate', task: 'Arena de Richard', at: '2026-10-29T16:00:00Z' },
        theirs: { who: 'Ana', frente: 'arena', task: 'Arena de Ana', at: '2026-10-29T15:40:00Z' } } }
      return f as never
    })
    mount()
    const card = await screen.findByRole('article', { name: 'Arena de Richard' })
    expect(within(card).getByText('Conflict in L_Arena with Ana')).toBeInTheDocument()
    const versions = within(card).getByRole('region', { name: 'Both versions' })
    expect(within(versions).getByText('Arena de Ana')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Approve' })).toBeNull()
    await userEvent.click(within(card).getByRole('button', { name: 'Keep mine' }))
    expect(api).toHaveBeenCalledWith('/approvals/a1/keep', { method: 'POST', body: { side: 'mine' } })
    expect(within(card).getByText('Kept yours · merge continues')).toBeInTheDocument()
  })
  it('hito 28: una línea base enseña propuesta, actual y diferencia con Aprobar y Rechazar; rechazar va al servicio', async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path !== '/approvals') return { state: 'changes' } as never
      const f = fixture(); f.items[0] = { ...f.items[0], type: 'baseline', title: 'Línea base: map L_Arena 1280x720', focus: [], evidence: [],
        summary: 'Propuesta desde «Arena».', baseline: { name: 'map-L_Arena-1280x720', current: 'C:/j/docs/baseline/map-L_Arena-1280x720.png', diff: 'C:/d/diff.png' } }
      return f as never
    })
    mount()
    const card = await screen.findByRole('article', { name: 'Línea base: map L_Arena 1280x720' })
    const shots = within(card).getByRole('region', { name: 'Baseline' })
    expect(within(shots).getAllByRole('figure').map((f) => f.textContent)).toEqual(['Proposed', 'Current', 'Difference'])
    expect(within(card).getByText('Proposed baseline · reports without failing until approved')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Request changes' })).toBeNull()
    expect(document.body.textContent).not.toMatch(ids)
    await userEvent.click(within(card).getByRole('button', { name: 'Reject' }))
    expect(api).toHaveBeenCalledWith('/approvals/a1/reject', { method: 'POST', body: {} })
    expect(within(card).getByText('Rejected · the next capture proposes another')).toBeInTheDocument()
  })
  it('hito 25: un cierre de hito bloqueado dice que falta tu aprobación sobre la build jugable', async () => {
    vi.mocked(api).mockImplementation(async () => { const f = fixture(); f.items[0] = { ...f.items[0], title: 'Cierre J1', blocked: 'Falta tu aprobación sobre la build jugable' }; return f as never })
    mount()
    const card = await screen.findByRole('article', { name: 'Cierre J1' })
    expect(within(card).getByText('Falta tu aprobación sobre la build jugable')).toHaveClass('text-warning')
  })
  it('cada elemento enseña qué es, el vídeo con controles sin autoplay, las imágenes y en qué fijarse; sin rutas ni nombres de archivo', async () => {
    mount()
    const card = await screen.findByRole('article', { name: 'J1.6 Reacciones a los golpes' })
    expect(within(card).getByText('Los golpes hacen retroceder al rival.')).toBeInTheDocument()
    const video = card.querySelector('video')!
    await waitFor(() => expect(video).toHaveAttribute('src'))
    expect(video).toHaveAttribute('controls'); expect(video.autoplay).toBe(false)
    const strip = within(card).getByRole('list', { name: 'Images' })
    // lo visual manda: el vídeo a todo el ancho (máx. 1280, 16:9) y las imágenes debajo, en tira
    expect(video).toHaveClass('w-full', 'max-w-[1280px]', 'aspect-video')
    expect(strip).toHaveClass('flex', 'overflow-x-auto')
    expect(video.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(card).getByText('Mira el retroceso al tercer golpe')).toBeInTheDocument()
    expect(screen.getByText('1 item to approve')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(ids)
  })

  it('Aprobar responde en el acto y llama al servicio', async () => {
    mount()
    const card = await screen.findByRole('article', { name: 'J1.6 Reacciones a los golpes' })
    await userEvent.click(within(card).getByRole('button', { name: 'Approve' }))
    expect(within(card).getByText('Approved · on to merge')).toBeInTheDocument()
    expect(api).toHaveBeenCalledWith('/approvals/a1/approve', { method: 'POST', body: {} })
  })

  it('Request changes exige texto y manda el literal; Comment no bloquea', async () => {
    mount()
    const card = await screen.findByRole('article', { name: 'J1.6 Reacciones a los golpes' })
    await userEvent.click(within(card).getByRole('button', { name: 'Request changes' }))
    const send = within(card).getByRole('button', { name: 'Send changes' })
    expect(send).toBeDisabled()
    fireEvent.change(within(card).getByRole('textbox', { name: /What to change/ }), { target: { value: 'Que el retroceso se note más' } })
    await userEvent.click(send)
    expect(api).toHaveBeenCalledWith('/approvals/a1/changes', { method: 'POST', body: { text: 'Que el retroceso se note más' } })
    expect(within(card).getByText('Changes requested · back to the owner')).toBeInTheDocument()
    expect(within(card).getByText('Que el retroceso se note más')).toBeInTheDocument()
    fireEvent.change(within(card).getByRole('textbox', { name: /Comment on/ }), { target: { value: 'El destello me gusta' } })
    await userEvent.click(within(card).getByRole('button', { name: 'Comment' }))
    expect(api).toHaveBeenCalledWith('/approvals/a1/comment', { method: 'POST', body: { text: 'El destello me gusta' } })
    expect(within(card).getByText('El destello me gusta')).toBeInTheDocument()
  })

  it('el comentario general llega al servicio sin elemento', async () => {
    mount()
    const general = await screen.findByRole('region', { name: 'General comment' })
    fireEvent.change(within(general).getByRole('textbox', { name: 'General comment' }), { target: { value: 'Buen ritmo' } })
    await userEvent.click(within(general).getByRole('button', { name: 'Comment' }))
    expect(api).toHaveBeenCalledWith('/approvals/comment', { method: 'POST', body: { text: 'Buen ritmo' } })
    expect(within(general).getByText('Buen ritmo')).toBeInTheDocument()
  })
})
