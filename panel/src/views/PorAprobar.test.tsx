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
  it('cada elemento enseña qué es, el vídeo con controles sin autoplay, las imágenes y en qué fijarse; sin rutas ni nombres de archivo', async () => {
    mount()
    const card = await screen.findByRole('article', { name: 'J1.6 Reacciones a los golpes' })
    expect(within(card).getByText('Los golpes hacen retroceder al rival.')).toBeInTheDocument()
    const video = card.querySelector('video')!
    await waitFor(() => expect(video).toHaveAttribute('src'))
    expect(video).toHaveAttribute('controls'); expect(video.autoplay).toBe(false)
    expect(within(card).getByRole('list', { name: 'Imágenes' })).toBeInTheDocument()
    expect(within(card).getByText('Mira el retroceso al tercer golpe')).toBeInTheDocument()
    expect(screen.getByText('Tienes 1 elemento por aprobar')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(ids)
  })

  it('Aprobar responde en el acto y llama al servicio', async () => {
    mount()
    const card = await screen.findByRole('article', { name: 'J1.6 Reacciones a los golpes' })
    await userEvent.click(within(card).getByRole('button', { name: 'Aprobar' }))
    expect(within(card).getByText('Aprobada · sigue a integración')).toBeInTheDocument()
    expect(api).toHaveBeenCalledWith('/approvals/a1/approve', { method: 'POST', body: {} })
  })

  it('Pedir cambios exige texto y manda el literal; Comentar no bloquea', async () => {
    mount()
    const card = await screen.findByRole('article', { name: 'J1.6 Reacciones a los golpes' })
    await userEvent.click(within(card).getByRole('button', { name: 'Pedir cambios' }))
    const send = within(card).getByRole('button', { name: 'Enviar los cambios' })
    expect(send).toBeDisabled()
    fireEvent.change(within(card).getByRole('textbox', { name: /Qué cambiar/ }), { target: { value: 'Que el retroceso se note más' } })
    await userEvent.click(send)
    expect(api).toHaveBeenCalledWith('/approvals/a1/changes', { method: 'POST', body: { text: 'Que el retroceso se note más' } })
    expect(within(card).getByText('Cambios pedidos · vuelve al responsable')).toBeInTheDocument()
    expect(within(card).getByText('Que el retroceso se note más')).toBeInTheDocument()
    fireEvent.change(within(card).getByRole('textbox', { name: /Comentario sobre/ }), { target: { value: 'El destello me gusta' } })
    await userEvent.click(within(card).getByRole('button', { name: 'Comentar' }))
    expect(api).toHaveBeenCalledWith('/approvals/a1/comment', { method: 'POST', body: { text: 'El destello me gusta' } })
    expect(within(card).getByText('El destello me gusta')).toBeInTheDocument()
  })

  it('el comentario general llega al servicio sin elemento', async () => {
    mount()
    const general = await screen.findByRole('region', { name: 'Comentario general' })
    fireEvent.change(within(general).getByRole('textbox', { name: 'Comentario general' }), { target: { value: 'Buen ritmo' } })
    await userEvent.click(within(general).getByRole('button', { name: 'Comentar' }))
    expect(api).toHaveBeenCalledWith('/approvals/comment', { method: 'POST', body: { text: 'Buen ritmo' } })
    expect(within(general).getByText('Buen ritmo')).toBeInTheDocument()
  })
})
