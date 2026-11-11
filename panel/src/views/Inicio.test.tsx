import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Task } from '@/lib/tasks'

vi.mock('@/api', () => ({ token: null, ApiError: class extends Error { status = 0 }, api: vi.fn() }))
import { api } from '@/api'
import { TooltipProvider } from '@/components/ui/tooltip'
import { refresh, resetStore } from '@/store'
import { humanQuestion, humanStatus, Inicio } from './Inicio'

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, createdAt: '2026-10-23T10:00:00.000Z', updatedAt: '2026-10-23T10:00:00.000Z', title: id, spec: '', acceptance: [], state: 'implementando',
  blockedReason: null, decisionId: null, area: 'gameplay', assigneeRole: null, assigneeProvider: null, parentTaskId: null, dependsOn: [],
  worktreeId: null, budgetId: null, ...over,
})

beforeEach(() => {
  resetStore()
  vi.mocked(api).mockReset()
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path === '/tasks') return [task('Salto'), task('HUD', { state: 'pendiente' }), task('Estatua', { state: 'done' }), task('Personaje', { state: 'preparada', decisionId: 'd1' })]
    if (path === '/decisions') return [{ id: 'd1', taskId: 'Personaje', state: 'open', reason: 'Tarea parada en «revisando» sin ningún paso', evidence: [], createdAt: '', chosenOptionId: null,
      options: [{ id: 'a', label: 'Retomar', description: '' }] }]
    if (path === '/approvals') return { pending: 0, items: [], general: [] }
    if (path === '/messages' || path === '/artifacts' || path.startsWith('/runs')) return []
    throw new Error(`sin simular: ${path}`)
  })
})
afterEach(cleanup)

describe('Inicio', () => {
  it('frases de persona en vez de estados internos', () => {
    expect(humanStatus(task('a'), false).text).toBe('Building it')
    expect(humanStatus(task('a', { blockedReason: 'x' }), false).text).toBe('Stuck')
    expect(humanStatus(task('a'), true).text).toBe('Has a question')
    expect(humanQuestion('Tarea parada en «probando» sin ningún paso en marcha')).toMatch(/^It stopped/)
    expect(humanQuestion('¿Qué personaje?')).toBe('¿Qué personaje?')
  })

  it('una sola página: decisión, en marcha, terminado, cola plegada y chat; sin ids', async () => {
    render(<TooltipProvider><RouterProvider router={createMemoryRouter([{ path: '/', element: <Inicio /> }])} /></TooltipProvider>)
    await act(async () => { await refresh() })
    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent('1 thing needs your call')
    const decision = await screen.findByRole('region', { name: 'Needs your call' })
    expect(within(decision).getByText('It stopped. Resume it or cancel it?')).toBeInTheDocument()
    expect(within(decision).getByRole('button', { name: 'Retomar' })).toBeInTheDocument()
    // la tarea que espera decisión no se repite en «Right now»
    const now = screen.getByRole('region', { name: 'Right now' })
    expect(within(now).getByRole('button', { name: 'Salto, Building it' })).toBeInTheDocument()
    expect(within(now).queryByText('Personaje')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Done' })).getByText('Estatua')).toBeInTheDocument()
    expect(screen.getByText('Queued').closest('details')).not.toHaveAttribute('open')
    expect(screen.getByRole('complementary', { name: 'Talk to Nomos' })).toBeInTheDocument()
  })

  it('las tarjetas siempre llevan imagen: la propia, si no la del juego, y la marca solo sin ninguna captura', async () => {
    const base = vi.mocked(api).getMockImplementation()!
    vi.mocked(api).mockImplementation(async (path: string) => path === '/artifacts'
      ? [{ id: 'shot', taskId: 'Salto', kind: 'screenshot', path: 's.png', license: null, createdAt: '2026-10-23T11:00:00.000Z' }] : base(path))
    render(<TooltipProvider><RouterProvider router={createMemoryRouter([{ path: '/', element: <Inicio /> }])} /></TooltipProvider>)
    await act(async () => { await refresh() })
    // primero sale la del juego y cambia a la propia cuando llega /artifacts: esperar al src, no al elemento
    await waitFor(() => expect(screen.getByRole('img', { name: 'Latest image of Salto' }).getAttribute('src')).toContain('/artifacts/shot/file'))
    const game = screen.getByRole('img', { name: 'Latest image of Estatua' })
    expect(game.getAttribute('src')).toMatch(/^\/capture\?/)
    // el proyecto no tiene ninguna captura: /capture da 404 y queda la marca, no una imagen rota
    fireEvent.error(game)
    expect(screen.queryByRole('img', { name: 'Latest image of Estatua' })).toBeNull()
    expect(screen.getAllByRole('img', { name: 'No capture yet' }).length).toBeGreaterThan(0)
  })
})
