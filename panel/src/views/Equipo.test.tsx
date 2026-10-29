import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Team } from './Equipo'

vi.mock('@/api', () => ({ token: 'tok', api: vi.fn(), ApiError: class extends Error {}, markUnauthorized: vi.fn() }))
import { api } from '@/api'
import { resetStore } from '@/store'
import { EquipoStrip } from './Equipo'

// Hito 29: «cada nomos de la red se concentre en trabajar en una funcionalidad y en local debe saberlo»
const team = (): Team => ({ me: { id: 'r1', name: 'Richard', frente: 'combate' }, peers: [
  { id: 'a1', name: 'Ana', frente: 'arena', present: true, build: { commit: 'abc1234def', at: '2026-10-29T15:00:00Z' },
    tasks: [{ id: 't1', title: 'Muro de la arena', state: 'implementando', area: 'escenarios' }, { id: 't2', title: 'Luces', state: 'preparada', area: 'escenarios' }],
    leases: [{ path: 'Content/Mapas/L_Arena.umap', until: '2026-10-29T16:40:00Z' }] },
  { id: 'l1', name: 'Luis', frente: 'audio', present: false, build: null, tasks: [], leases: [] }] })

beforeEach(() => {
  cleanup(); resetStore(); vi.mocked(api).mockReset()
  vi.mocked(api).mockImplementation(async (path: string) => (path === '/team' ? team() : { ok: true }) as never)
})

describe('Franja Equipo', () => {
  it('una línea por persona: nombre, frente, presente o ausente, tareas en curso, reservas y build', async () => {
    render(<EquipoStrip />)
    const strip = await screen.findByRole('region', { name: 'Equipo' })
    expect(within(strip).getByText('Equipo · tú: Richard (combate)')).toBeInTheDocument()
    const ana = within(strip).getByRole('listitem', { name: 'Ana' })
    expect(ana).toHaveTextContent('arena'); expect(ana).toHaveTextContent('presente')
    expect(within(ana).getByRole('button', { name: 'Muro de la arena' })).toBeInTheDocument()
    expect(within(ana).queryByRole('button', { name: 'Luces' })).toBeNull()
    expect(ana).toHaveTextContent(/reserva L_Arena hasta \d\d:\d\d/); expect(ana).toHaveTextContent('build abc1234')
    const luis = within(strip).getByRole('listitem', { name: 'Luis' })
    expect(luis).toHaveTextContent('ausente'); expect(luis).toHaveTextContent('sin tareas en curso'); expect(luis).toHaveTextContent('sin build aprobada')
  })

  it('la ficha ajena es de solo lectura y su única acción es Pedir', async () => {
    render(<EquipoStrip />)
    await userEvent.click(await screen.findByRole('button', { name: 'Muro de la arena' }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText(/Solo la mueve Ana/)).toBeInTheDocument()
    expect(within(sheet).getAllByRole('button').map((b) => b.textContent).filter((t) => t !== 'Close')).toEqual(['Pedir'])
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Qué pedir a Ana' }), 'Deja un hueco para la puerta')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Pedir' }))
    expect(api).toHaveBeenCalledWith('/team/ask', { method: 'POST', body: { to: 'Ana', title: 'Muro de la arena', text: 'Deja un hueco para la puerta' } })
  })

  it('sin equipo no aparece', async () => {
    vi.mocked(api).mockImplementation(async () => ({ me: null, peers: [] }) as never)
    const { container } = render(<EquipoStrip />)
    await vi.waitFor(() => expect(api).toHaveBeenCalledWith('/team'))
    expect(container).toBeEmptyDOMElement()
  })
})
