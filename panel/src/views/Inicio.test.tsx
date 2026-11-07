import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
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
    expect(humanStatus(task('a'), false).text).toBe('Construyéndolo')
    expect(humanStatus(task('a', { blockedReason: 'x' }), false).text).toBe('Se ha atascado')
    expect(humanStatus(task('a'), true).text).toBe('Tiene una pregunta')
    expect(humanQuestion('Tarea parada en «probando» sin ningún paso en marcha')).toMatch(/^Se ha quedado parada/)
    expect(humanQuestion('¿Qué personaje?')).toBe('¿Qué personaje?')
  })

  it('una sola página: decisión, en marcha, terminado, cola plegada y chat; sin ids', async () => {
    render(<TooltipProvider><RouterProvider router={createMemoryRouter([{ path: '/', element: <Inicio /> }])} /></TooltipProvider>)
    await act(async () => { await refresh() })
    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent('1 cosa espera tu decisión')
    const decision = await screen.findByRole('region', { name: 'Necesita tu decisión' })
    expect(within(decision).getByText('Se ha quedado parada. ¿La retomo o la cancelo?')).toBeInTheDocument()
    expect(within(decision).getByRole('button', { name: 'Retomar' })).toBeInTheDocument()
    // la tarea que espera decisión no se repite en «Ahora mismo»
    const now = screen.getByRole('region', { name: 'Ahora mismo' })
    expect(within(now).getByRole('button', { name: 'Salto, Construyéndolo' })).toBeInTheDocument()
    expect(within(now).queryByText('Personaje')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Terminado' })).getByText('Estatua')).toBeInTheDocument()
    expect(screen.getByText('En cola').closest('details')).not.toHaveAttribute('open')
    expect(screen.getByRole('complementary', { name: 'Habla con Nomos' })).toBeInTheDocument()
  })
})
