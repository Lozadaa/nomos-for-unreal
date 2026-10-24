import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from './ui/tooltip'
import { TaskRow } from './TaskRow'
import type { Task } from '@/lib/tasks'

const task = (over: Partial<Task> = {}): Task => ({
  id: 'seed-task-09', createdAt: '2026-10-23T10:00:00.000Z', updatedAt: '2026-10-23T10:00:00.000Z', title: 'Barra de vida', spec: '', acceptance: [],
  state: 'preparada', blockedReason: null, decisionId: null, area: 'ui', assigneeRole: null, assigneeProvider: 'claude', parentTaskId: null,
  dependsOn: [], worktreeId: null, budgetId: null, ...over,
})
const row = (over: Partial<Task>) => {
  render(<TooltipProvider><TaskRow task={task(over)} now={Date.parse('2026-10-23T10:02:00Z')} open={false} onOpen={vi.fn()} /></TooltipProvider>)
  return screen.getByRole('button', { name: /Barra de vida/ })
}

describe('prioridad del director (hito 13)', () => {
  it('sin prioridad (0 o ausente) no hay glifo', () => {
    expect(row({ priority: 0 }).querySelector('[data-task-priority]')).toBeNull()
  })
  it('prioridad positiva o negativa: un glifo pequeño, sin texto visible nuevo', () => {
    const up = row({ priority: 3 }).querySelector('[data-task-priority]')!
    expect(up).not.toBeNull(); expect(up.getAttribute('data-task-priority')).toBe('up'); expect(up.textContent).toBe('')
  })
  it('negativa apunta abajo', () => {
    expect(row({ priority: -1 }).querySelector('[data-task-priority]')!.getAttribute('data-task-priority')).toBe('down')
  })
})
