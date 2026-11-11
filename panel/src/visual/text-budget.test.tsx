import { act, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { TaskRow } from '@/components/TaskRow'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { NomosEvent, Run, Task } from '@/lib/tasks'
import { ingest, resetStore } from '@/store'
import { budgets, visibleWords } from './text-budget'

const task: Task = {
  id: 'seed-task-05', title: 'Implementar locomoción', createdAt: '2026-10-23T10:00:00Z', updatedAt: '2026-10-23T10:00:00Z',
  spec: '', acceptance: [], state: 'implementando', blockedReason: null, decisionId: null, area: 'animacion',
  assigneeRole: 'desarrollador', assigneeProvider: 'codex', parentTaskId: null, dependsOn: [], worktreeId: null, budgetId: null,
}
beforeEach(resetStore)

it('cuenta texto visible y omite atributos, contenido oculto, opciones cerradas y ayudas', () => {
  const { container } = render(<div title="no contar atributos" aria-label="ni esto">
    <span>Dos palabras</span><span hidden>oculto aquí</span><span className="sr-only">para lectores</span>
    <span style={{ display: 'none' }}>sin mostrar</span><span aria-hidden="true">decoración</span>
    <span role="tooltip" hidden>ayuda cerrada</span><select defaultValue="b"><option value="a">Otra opción</option><option value="b">Audio</option></select>
    <svg><title>Descripción del SVG</title><text>60%</text></svg>
  </div>)
  expect(visibleWords(container)).toBe(4)
  expect(budgets).toEqual({ produccionRow: 7, viewHeader: 4, catalogCard: 5, decisionCard: 20, directorBar: 4 })
})

it('fila semilla: siete palabras como máximo además del título/id, con área, estado y proveedor en orden', () => {
  render(<TooltipProvider><TaskRow task={task} now={Date.parse(task.updatedAt) + 120_000} open={false} onOpen={vi.fn()} /></TooltipProvider>)
  const row = screen.getByRole('button', { name: /Implementar locomoción/ })
  expect(row).toHaveAccessibleName('Implementar locomoción, Animation, Building, Codex, Stage: Building, Anim Worker')
  expect(within(row).getAllByRole('img').map((el) => el.getAttribute('aria-label'))).toEqual(['Animation', 'Building', 'Anim Worker · Codex'])
  const clone = row.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-task-title], [data-task-id-text]').forEach((el) => el.remove())
  expect(visibleWords(clone)).toBeLessThanOrEqual(budgets.produccionRow)
  expect(row).toHaveTextContent('2 min')
  expect(row).toHaveTextContent('Anim Worker')
  expect(row).not.toHaveTextContent(/Codex|desarrollador/)
  expect(within(row).getByRole('img', { name: 'Anim Worker · Codex' })).toHaveAttribute('data-state', 'idle')
})

it('el tooltip de fila explica área, estado, proveedor y etapa también con bloqueo', async () => {
  render(<TooltipProvider delay={0}><TaskRow task={{ ...task, blockedReason: 'Falta el pack.' }} now={Date.now()} open={false} onOpen={vi.fn()} /></TooltipProvider>)
  const row = screen.getByRole('button', { name: /Implementar locomoción/ })
  await act(async () => row.focus())
  const tooltip = await screen.findByRole('tooltip')
  for (const text of ['Animation', 'Blocked', 'Codex', 'Building', 'Anim Worker', 'Falta el pack.']) expect(tooltip).toHaveTextContent(text)
})

it('la ejecución en curso y la espera cambian el anillo del avatar, sin anillo aparte ni porcentaje ficticio', () => {
  const run: Run = { id: 'r', taskId: task.id, provider: 'codex', role: 'implementacion', state: 'running', startedAt: task.updatedAt, finishedAt: null, summary: null }
  const { rerender } = render(<TaskRow task={task} run={run} now={Date.now()} open={false} onOpen={vi.fn()} />)
  const avatar = () => screen.getByRole('img', { name: 'Anim Worker · Codex' })
  expect(avatar()).toHaveAttribute('data-state', 'running')
  expect(screen.getAllByRole('img')).toHaveLength(3)
  expect(screen.queryByRole('img', { name: 'Ejecución en curso' })).toBeNull()
  expect(screen.queryByText(/%/)).toBeNull()

  rerender(<TaskRow task={task} run={{ ...run, waiting: true }} now={Date.now()} open={false} onOpen={vi.fn()} />)
  expect(avatar()).toHaveAttribute('data-state', 'waiting')

  rerender(<TaskRow task={task} run={{ ...run, state: 'done' }} now={Date.now()} open={false} onOpen={vi.fn()} />)
  expect(avatar()).toHaveAttribute('data-state', 'idle')
  expect(screen.queryByText(/%/)).toBeNull()
})

it('el nombre y el ordinal vienen de la asignación de agentes vivos y desaparece la insignia al quedar libre', () => {
  const run: Run = { id: 'r', taskId: task.id, provider: 'opencode', role: 'revisor', state: 'running', startedAt: task.updatedAt, finishedAt: null, summary: null }
  const { rerender } = render(<TaskRow task={task} run={run} agent={{ name: 'Anim Master 2', ordinal: 2 }} now={Date.now()} open={false} onOpen={vi.fn()} />)
  const avatar = screen.getByRole('img', { name: 'Anim Master 2 · OpenCode' })
  expect(avatar.querySelector('.k-agent-ordinal')).toHaveTextContent('2')
  expect(screen.getByText('Anim Master 2')).toBeInTheDocument()

  rerender(<TaskRow task={task} agent={{ name: 'Anim Worker', ordinal: 2 }} now={Date.now()} open={false} onOpen={vi.fn()} />)
  expect(screen.getByRole('img', { name: 'Anim Worker · Codex' }).querySelector('.k-agent-ordinal')).toBeNull()
})

it('la espera del store solo marca el avatar de la ejecución correspondiente', () => {
  const run: Run = { id: 'r', taskId: task.id, provider: 'codex', role: 'implementacion', state: 'running', startedAt: task.updatedAt, finishedAt: null, summary: null }
  const event = (seq: number, runId: string): NomosEvent => ({ seq, id: `e${seq}`, type: 'worker.waiting', messageId: null, createdAt: task.updatedAt, payload: { taskId: task.id, runId, question: '¿Qué opción?' } })
  render(<TaskRow task={task} run={run} now={Date.now()} open={false} onOpen={vi.fn()} />)
  act(() => { ingest(event(1, 'otra')) })
  expect(screen.getByRole('img', { name: 'Anim Worker · Codex' })).toHaveAttribute('data-state', 'running')
  act(() => { ingest(event(2, 'r')) })
  expect(screen.getByRole('img', { name: 'Anim Worker · Codex' })).toHaveAttribute('data-state', 'waiting')
})
