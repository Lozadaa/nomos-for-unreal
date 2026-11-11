import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { Decision, Task, TaskDetail } from '@/lib/tasks'
import { budgets, visibleWords } from '@/visual/text-budget'

vi.mock('@/api', () => ({ api: vi.fn(), token: null, ApiError: class extends Error {} }))
import { api } from '@/api'
import { refresh, resetStore } from '@/store'
import { Decisiones } from './Decisiones'
import { TaskSheet } from './TaskSheet'

const task: Task = {
  id: 'task-1', title: 'Interfaz del inventario para la partida de CrazyPadel', state: 'preparada', area: 'ui',
  blockedReason: null, decisionId: 'd1', createdAt: '', updatedAt: '', spec: '', acceptance: [], assigneeProvider: 'codex', assigneeRole: 'implementacion',
  parentTaskId: null, dependsOn: [], worktreeId: null, budgetId: null,
}
const decision: Decision = {
  id: 'd1', taskId: task.id, createdAt: '', state: 'open', chosenOptionId: null,
  reason: 'Elige la propuesta de inventario que quieres desarrollar para que el responsable continúe con la implementación de esta interfaz',
  evidence: [{ kind: 'archivo', ref: 'Source/UI/Inventory.cpp' }],
  options: [
    { id: 'a', label: 'Interfaz compacta con paneles laterales y acceso rápido', description: 'Conserva el contexto de la partida mientras eliges objetos.' },
    { id: 'b', label: 'Opción B', description: 'La alternativa utiliza una pantalla independiente.' },
  ],
}

beforeEach(() => {
  resetStore()
  vi.mocked(api).mockReset()
  vi.mocked(api).mockImplementation(async (path: string) => path === '/tasks' ? [task] : path === '/decisions' ? [decision] : {})
})

describe('Opciones visuales de decisión', () => {
  it('limita las palabras, conserva las etiquetas originales accesibles y ofrece evidencia en un detalle compacto', async () => {
    await act(async () => { await refresh() })
    render(<MemoryRouter><Decisiones /></MemoryRouter>)
    const card = await screen.findByRole('region', { name: 'Decision' })
    expect(visibleWords(card)).toBeLessThanOrEqual(budgets.decisionCard)
    expect(card).toHaveAttribute('data-decision-card')
    const options = within(card).getByRole('group', { name: 'Options' })
    expect(within(options).queryAllByRole('img')).toHaveLength(0) // hito 7: tarjetas de texto, sin el pictograma repetido
    expect(within(options).getByRole('button', { name: decision.options[0].label })).toBeInTheDocument()
    expect(within(options).getByRole('button', { name: 'Opción B' })).toHaveTextContent('Opción B')
    expect(within(card).queryByText(decision.options[0].description)).not.toBeInTheDocument()
    expect(within(card).queryByText('Source/UI/Inventory.cpp')).not.toBeInTheDocument()

    await userEvent.setup().click(within(card).getByRole('button', { name: 'Details' }))
    const detail = await screen.findByRole('dialog', { name: 'Decision details' })
    expect(detail).toHaveTextContent(decision.reason)
    expect(detail).toHaveTextContent(task.title)
    expect(detail).toHaveTextContent('Source/UI/Inventory.cpp')
  })

  it('las tarjetas del detalle de tarea son de texto y conservan la acción de elegir', async () => {
    const detail: TaskDetail = { task, decision, runs: [], events: [], artifacts: [], testRuns: [] }
    vi.mocked(api).mockImplementation(async (path: string) => path.startsWith('/tasks/') ? detail : {})
    render(<TaskSheet id={task.id} task={task} onClose={() => {}} />)
    const card = await screen.findByRole('region', { name: 'Pending decision' })
    expect(visibleWords(card)).toBeLessThanOrEqual(budgets.decisionCard)
    expect(card).toHaveAttribute('data-decision-card')
    expect(within(card).queryAllByRole('img')).toHaveLength(0)
    await userEvent.setup().click(within(card).getByRole('button', { name: 'Opción B' }))
    expect(api).toHaveBeenCalledWith('/decisions/d1/resolve', { method: 'POST', body: { optionId: 'b', by: 'director' } })
  })

  it('hito 20: una Decisión repetida dice cuántas veces se vio, sin pasarse del presupuesto', async () => {
    const repeated = { ...decision, seenCount: 4 }
    vi.mocked(api).mockImplementation(async (path: string) => path === '/tasks' ? [task] : path === '/decisions' ? [repeated] : {})
    await act(async () => { await refresh() })
    render(<MemoryRouter><Decisiones /></MemoryRouter>)
    const card = await screen.findByRole('region', { name: 'Decision' })
    expect(card).toHaveTextContent('Seen 4 times')
    expect(visibleWords(card)).toBeLessThanOrEqual(budgets.decisionCard)
    const detail: TaskDetail = { task, decision: repeated, runs: [], events: [], artifacts: [], testRuns: [] }
    vi.mocked(api).mockImplementation(async (path: string) => path.startsWith('/tasks/') ? detail : {})
    render(<TaskSheet id={task.id} task={task} onClose={() => {}} />)
    const sheet = await screen.findByRole('region', { name: 'Pending decision' })
    expect(sheet).toHaveTextContent('Seen 4 times')
    expect(visibleWords(sheet)).toBeLessThanOrEqual(budgets.decisionCard)
  })

  it('mantiene el presupuesto tras elegir una etiqueta larga', async () => {
    await act(async () => { await refresh() })
    render(<MemoryRouter><Decisiones /></MemoryRouter>)
    const card = await screen.findByRole('region', { name: 'Decision' })
    await userEvent.setup().click(within(card).getByRole('button', { name: decision.options[0].label }))
    expect(visibleWords(card)).toBeLessThanOrEqual(budgets.decisionCard)
    expect(within(card).getByRole('status')).toHaveAccessibleName(`You chose ${decision.options[0].label}. Codex continues.`)
  })
})
