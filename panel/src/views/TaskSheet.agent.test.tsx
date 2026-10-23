import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { Run, Task, TaskDetail } from '@/lib/tasks'

vi.mock('@/api', () => ({ token: null, api: vi.fn(), ApiError: class extends Error { status = 0 } }))
import { api } from '@/api'
import { resetStore } from '@/store'
import { TaskSheet } from './TaskSheet'

const task: Task = {
  id: 'task-ui', createdAt: '', updatedAt: '2026-10-23T10:00:00.000Z', title: 'Diseñar HUD', spec: '', acceptance: [], state: 'implementando',
  blockedReason: null, decisionId: null, area: 'ui', assigneeRole: 'implementacion', assigneeProvider: 'codex',
  parentTaskId: null, dependsOn: [], worktreeId: null, budgetId: null,
}
const run = (id: string, provider: string, state: Run['state'] = 'running', role = 'implementacion'): Run => ({
  id, taskId: task.id, role, provider, state, startedAt: '2026-10-23T10:00:00.000Z', finishedAt: state === 'running' ? null : '2026-10-23T10:01:00.000Z', summary: null,
})
function serve(runs: Run[], selectedTask = task) {
  const detail: TaskDetail = { task: selectedTask, runs, events: [], artifacts: [], testRuns: [], decision: null }
  vi.mocked(api).mockResolvedValue(detail)
}

beforeEach(() => { resetStore(); vi.mocked(api).mockReset() })
afterEach(() => { cleanup(); resetStore() })

describe('TaskSheet · identidad de agentes compartida con Producción', () => {
  it('usa nombre y ordinal globales por run id en cabecera y ejecuciones', async () => {
    serve([run('r2', 'opencode'), run('r1', 'codex')])
    const agents = new Map([['r1', { name: 'UI Worker', ordinal: 1 }], ['r2', { name: 'UI Worker 3', ordinal: 3 }]])
    render(<TaskSheet id={task.id} task={task} agentsByRunId={agents} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    const avatars = await within(dialog).findAllByRole('img', { name: 'UI Worker 3 · OpenCode' })
    expect(avatars).toHaveLength(2)
    for (const avatar of avatars) expect(avatar.querySelector('.k-agent-ordinal')).toHaveTextContent('3')
    const header = dialog.querySelector('[data-slot="sheet-description"]')!
    expect(header).toHaveTextContent('UI Worker 3')
    expect(header).toHaveTextContent('OpenCode')
  })

  it('sin mapa global asigna ordinal solo a duplicados vivos y prefiere el run activo al terminado más reciente', async () => {
    const completed = { ...run('r3', 'codex', 'done'), startedAt: '2026-10-23T11:00:00.000Z' }
    serve([run('r2', 'opencode'), completed, run('r1', 'codex')])
    render(<TaskSheet id={task.id} task={task} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    const avatars = await within(dialog).findAllByRole('img', { name: 'UI Worker 2 · OpenCode' })
    expect(avatars).toHaveLength(2)
    for (const avatar of avatars) {
      expect(avatar).toHaveAttribute('data-state', 'running')
      expect(avatar.querySelector('.k-agent-ordinal')).toHaveTextContent('2')
    }
    const idle = dialog.querySelector('.k-agent-avatar[data-state="idle"]')!
    expect(idle).toHaveAccessibleName('UI Worker · Codex')
    expect(idle.querySelector('.k-agent-ordinal')).toBeNull()
  })

  it('deriva el nombre del rol verificado del run cuando la tarea no declara responsable por rol', async () => {
    const selectedTask = { ...task, area: 'escenarios' as const, assigneeRole: null }
    serve([run('review', 'claude', 'running', 'revisor')], selectedTask)
    render(<TaskSheet id={task.id} task={selectedTask} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findAllByRole('img', { name: 'Escenas Master · Claude' })).toHaveLength(2)
    const header = dialog.querySelector('[data-slot="sheet-description"]')!
    expect(header).toHaveTextContent('Escenas Master')
    expect(header).toHaveTextContent('Claude Code')
  })

  it('restaura la espera desde metadata verificada y no muestra espera en una ejecución terminada', async () => {
    serve([
      { ...run('r1', 'codex', 'done'), metadata: { waiting: true } },
      { ...run('r2', 'claude'), metadata: { waiting: true } },
    ])
    render(<TaskSheet id={task.id} task={task} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    const waitingAvatars = await within(dialog).findAllByRole('img', { name: 'UI Worker · Claude' })
    expect(waitingAvatars).toHaveLength(2)
    for (const avatar of waitingAvatars) expect(avatar).toHaveAttribute('data-state', 'waiting')
    expect(within(dialog).getByRole('img', { name: 'UI Worker · Codex' })).toHaveAttribute('data-state', 'idle')
  })
})
