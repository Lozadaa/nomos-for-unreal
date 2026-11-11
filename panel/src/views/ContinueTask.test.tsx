import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import type { TaskDetail } from '@/lib/tasks'

vi.mock('@/api', () => ({ token: 'tok', ApiError: class extends Error {}, api: vi.fn() }))
vi.mock('@/feel/toasts', () => ({ toasts: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { api } from '@/api'
import { WorkerChatTab } from './TaskTabs'

const Where = () => <output aria-label="ruta">{useLocation().search}</output>
const detail = { task: { id: 't1', title: 'HUD', state: 'done', scope: [] }, events: [], artifacts: [], testRuns: [], decision: null,
  runs: [{ id: 'r1', taskId: 't1', role: 'implementacion', provider: 'claude', state: 'done', startedAt: '', finishedAt: null, summary: null }] } as unknown as TaskDetail

describe('pedir cambios después de DONE', () => {
  it('crea la tarea hija con POST /tasks/:id/continue y la abre', async () => {
    vi.mocked(api).mockImplementation((async (path: string) => path.endsWith('/continue') ? { taskId: 'hija', commandId: 'c' } : []) as typeof api)
    render(<MemoryRouter initialEntries={['/?tarea=t1']}><Routes><Route path="/" element={<><WorkerChatTab detail={detail} /><Where /></>} /></Routes></MemoryRouter>)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Request changes from the owner'), 'Más grande')
    await user.click(screen.getByRole('button', { name: 'Request changes' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/tasks/t1/continue', { method: 'POST', body: { text: 'Más grande' } }))
    await waitFor(() => expect(screen.getByLabelText('ruta').textContent).toBe('?tarea=hija'))
    expect(screen.queryByText('La ejecución ya terminó.')).toBeNull()
  })
})
