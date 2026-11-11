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
    leases: [{ path: 'Content/Mapas/L_Arena.umap', until: '2026-10-29T16:40:00Z' }],
    done: [{ id: 't0', title: 'Puerta de la arena', summary: 'La puerta se abre', at: '2026-10-29T14:00:00Z' }],
    main: { commit: '9ab948d1234', at: '2026-10-29T14:00:00Z' }, behind: 2 },
  { id: 'l1', name: 'Luis', frente: 'audio', present: false, build: null, tasks: [], leases: [] }] })

beforeEach(() => {
  cleanup(); resetStore(); vi.mocked(api).mockReset()
  vi.mocked(api).mockImplementation(async (path: string) => (path === '/team' ? team() : { ok: true }) as never)
})

describe('Franja Equipo', () => {
  it('una línea por persona: nombre, frente, presente o ausente, tareas en curso, reservas, build, lo último hecho y si va por detrás de main', async () => {
    render(<EquipoStrip />)
    const strip = await screen.findByRole('region', { name: 'Team' })
    expect(within(strip).getByText('Team · you: Richard (combate)')).toBeInTheDocument()
    const ana = within(strip).getByRole('listitem', { name: 'Ana' })
    expect(ana).toHaveTextContent('arena'); expect(ana).toHaveTextContent('online')
    expect(within(ana).getByRole('button', { name: 'Muro de la arena' })).toBeInTheDocument()
    expect(within(ana).queryByRole('button', { name: 'Luces' })).toBeNull()
    expect(ana).toHaveTextContent(/holding L_Arena until \d\d:\d\d/); expect(ana).toHaveTextContent('build abc1234')
    const luis = within(strip).getByRole('listitem', { name: 'Luis' })
    expect(ana).toHaveTextContent('done: Puerta de la arena'); expect(ana).toHaveTextContent('main 9ab948d · 2 behind')
    expect(luis).not.toHaveTextContent('done'); expect(luis).not.toHaveTextContent('main')
    expect(luis).toHaveTextContent('away'); expect(luis).toHaveTextContent('no tasks in progress'); expect(luis).toHaveTextContent('no approved build')
  })

  it('la ficha ajena es de solo lectura y su única acción es Pedir', async () => {
    render(<EquipoStrip />)
    await userEvent.click(await screen.findByRole('button', { name: 'Muro de la arena' }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText(/Only they can move it/)).toBeInTheDocument()
    expect(within(sheet).getAllByRole('button').map((b) => b.textContent).filter((t) => t !== 'Close')).toEqual(['Ask'])
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'What to ask Ana' }), 'Deja un hueco para la puerta')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Ask' }))
    expect(api).toHaveBeenCalledWith('/team/ask', { method: 'POST', body: { to: 'Ana', title: 'Muro de la arena', text: 'Deja un hueco para la puerta' } })
  })

  it('sin equipo no aparece', async () => {
    vi.mocked(api).mockImplementation(async () => ({ me: null, peers: [] }) as never)
    const { container } = render(<EquipoStrip />)
    await vi.waitFor(() => expect(api).toHaveBeenCalledWith('/team'))
    expect(container).toBeEmptyDOMElement()
  })
})
