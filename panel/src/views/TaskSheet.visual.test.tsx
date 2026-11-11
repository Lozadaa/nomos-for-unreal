import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { Task, TaskDetail } from '@/lib/tasks'

vi.mock('@/api', () => ({ token: null, api: vi.fn(), ApiError: class extends Error { status = 0 } }))
import { api } from '@/api'
import { TaskSheet } from './TaskSheet'

afterEach(cleanup)

describe('Detalle visual de tarea', () => {
  it('explica área, estado, proveedor y etapa también cuando la tarea está bloqueada', async () => {
    const task: Task = {
      id: 'task-1', createdAt: '', updatedAt: new Date().toISOString(), title: 'Revisar escena', spec: '', acceptance: [], state: 'revisando',
      blockedReason: 'Faltan texturas', decisionId: null, area: 'escenarios', assigneeRole: 'revisor', assigneeProvider: 'claude',
      parentTaskId: null, dependsOn: [], worktreeId: null, budgetId: null,
    }
    const detail: TaskDetail = { task, runs: [{ id: 'claude-2', taskId: task.id, role: 'revisor', provider: 'claude', state: 'running', startedAt: '', finishedAt: null, summary: null }], events: [], artifacts: [], testRuns: [], decision: null }
    vi.mocked(api).mockResolvedValue(detail)
    render(<TaskSheet id={task.id} task={task} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Revisar escena' })
    expect(within(dialog).getByRole('img', { name: 'Levels' })).toBeInTheDocument()
    expect(within(dialog).getByRole('img', { name: 'Blocked' })).toBeInTheDocument()
    expect(await within(dialog).findAllByRole('img', { name: /Level Master.*Claude/ })).not.toHaveLength(0)
    const description = dialog.querySelector('[data-slot="sheet-description"]')!
    expect(description).toHaveTextContent('Area: Levels')
    expect(description).toHaveTextContent('Status: Blocked')
    expect(description).toHaveTextContent('Stage: Reviewing')
    expect(description).toHaveTextContent('Claude Code')
    expect(description).toHaveTextContent('Reviewer')
    expect(description).toHaveTextContent('Level Master')
  })
})
