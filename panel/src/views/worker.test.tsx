import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { NomosEvent, Task, TaskDetail } from '@/lib/tasks'

vi.mock('@/api', () => {
  class ApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  }
  return { token: 'tok', ApiError, api: vi.fn() }
})
vi.mock('@/feel/toasts', () => ({ toasts: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { api, ApiError } from '@/api'
import { ingest, resetStore } from '@/store'
import { ChangesTab, WorkerChatTab } from './TaskTabs'

const mockApi = vi.mocked(api)
let seq = 0
const event = (type: string, payload: Record<string, unknown> = {}): NomosEvent => ({
  seq: ++seq, id: `e${seq}`, type, messageId: null, payload, createdAt: new Date(Date.UTC(2026, 9, 23, 10, 0, seq)).toISOString(),
})
const task = { id: 't1', title: 'Cámara', scope: ['Source/Cam'] } as unknown as Task
const detail = (state: 'running' | 'done' = 'running'): TaskDetail => ({
  task, events: [], artifacts: [], testRuns: [], decision: null,
  runs: [{ id: 'r1', taskId: 't1', role: 'dev', provider: 'codex', state, startedAt: '', finishedAt: null, summary: null }],
})
const patch = [
  'diff --git a/Source/Cam/A.cpp b/Source/Cam/A.cpp', '--- a/Source/Cam/A.cpp', '+++ b/Source/Cam/A.cpp', '@@ -1 +1 @@', '-a', '+b', '',
  'diff --git a/Config/B.ini b/Config/B.ini', '--- a/Config/B.ini', '+++ b/Config/B.ini', '@@ -1 +1 @@', '-x', '+y', '',
].join('\n')

beforeEach(() => { resetStore(); seq = 0; mockApi.mockReset() })
afterEach(cleanup)

describe('Cambios', () => {
  it('avisa de archivos fuera del alcance y filtra por archivo', async () => {
    mockApi.mockResolvedValue({ stat: ' 2 files changed', patch })
    render(<ChangesTab detail={detail()} />)
    const alert = await screen.findByRole('alert', { name: 'Archivos fuera del alcance declarado' })
    expect(alert).toHaveTextContent('Config/B.ini')
    expect(alert).not.toHaveTextContent('Source/Cam/A.cpp')
    await userEvent.setup().selectOptions(screen.getByLabelText('Filtrar por archivo'), 'Config/B.ini')
    expect(screen.queryByText('+b')).toBeNull()
    expect(screen.getByText('+y')).toBeInTheDocument()
  })

  it('dice que no hay workers si la ruta responde 404', async () => {
    mockApi.mockRejectedValue(new ApiError(404, 'not_found'))
    render(<ChangesTab detail={detail()} />)
    expect(await screen.findByText('Disponible cuando haya workers')).toBeInTheDocument()
  })
})

describe('Chat del worker', () => {
  it('agrupa la salida por sondeo, destaca la pregunta y la retira cuando el worker sigue', async () => {
    mockApi.mockResolvedValue([{ seq: 1, createdAt: '2026-10-23T10:00:05Z', payload: { lines: ['compilando', 'listo'] } }])
    render(<WorkerChatTab detail={detail()} />)
    expect(await screen.findByText(/compilando/)).toBeInTheDocument()
    act(() => { ingest(event('worker.waiting', { runId: 'r1', taskId: 't1', question: '¿Uso Enhanced Input?' })) })
    expect(screen.getByRole('region', { name: 'Pregunta del worker' })).toHaveTextContent('¿Uso Enhanced Input?')
    act(() => { ingest(event('worker.output', { runId: 'r1', taskId: 't1', lines: ['ok'] })) })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Pregunta del worker' })).toBeNull())
  })

  it('envía la petición a POST /runs/:id/message', async () => {
    mockApi.mockImplementation((async (path: string) => (path.endsWith('/message') ? { commandId: 'c' } : [])) as typeof api)
    render(<WorkerChatTab detail={detail()} />)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Pedir cambios al responsable'), 'Usa Enhanced Input')
    await user.click(screen.getByRole('button', { name: 'Pedir cambios al responsable' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/runs/r1/message', { method: 'POST', body: { text: 'Usa Enhanced Input' } }))
  })

  it('detener pide confirmación en línea y llama a POST /runs/:id/stop; no aparece con la ejecución terminada', async () => {
    mockApi.mockImplementation((async (path: string) => (path.endsWith('/stop') ? { commandId: 'c' } : [])) as typeof api)
    const { unmount } = render(<WorkerChatTab detail={detail()} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Detener worker' }))
    expect(mockApi).not.toHaveBeenCalledWith('/runs/r1/stop', expect.anything())
    await user.click(screen.getByRole('button', { name: 'Detener' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/runs/r1/stop', { method: 'POST', body: {} }))
    unmount()
    render(<WorkerChatTab detail={detail('done')} />)
    await screen.findByText('La ejecución ya terminó.')
    expect(screen.queryByRole('button', { name: 'Detener worker' })).toBeNull()
  })
})
