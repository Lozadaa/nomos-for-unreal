import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import userEvent from '@testing-library/user-event'
import type { Task } from '@/lib/tasks'

vi.mock('@/api', () => ({ token: 'tok', ApiError: class extends Error {}, api: vi.fn() }))
vi.mock('@/feel/toasts', () => ({ toasts: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { api } from '@/api'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Header } from '@/shell/Header'
import { ArchiveTab, Attribution, ClosingNote } from './Closing'

const task = (over: Partial<Task> = {}) => ({ id: 't1', title: 'HUD', state: 'cerrando', area: 'ui', blockedReason: null, decisionId: null,
  waitReason: 'Cambios sin registrar: b.txt', ...over }) as Task
beforeEach(() => { vi.mocked(api).mockReset() })

describe('cierre en el panel', () => {
  it('Cerrando muestra el motivo y «Reintentar cierre» llama a POST /tasks/:id/finalize', async () => {
    vi.mocked(api).mockResolvedValue({ commandId: 'c' })
    render(<ClosingNote task={task()} onOpen={() => {}} />)
    expect(screen.getByText('Cambios sin registrar: b.txt')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar cierre' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/tasks/t1/finalize', { method: 'POST', body: {} }))
  })

  it('con Decisión abierta la acción es decidir (abre la tarea)', async () => {
    const onOpen = vi.fn()
    render(<ClosingNote task={task({ decisionId: 'd1', blockedReason: 'Conflicto binario al integrar en master: BP_Puerta.uasset' })} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: 'Decidir' }))
    expect(onOpen).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Reintentar cierre' })).toBeNull()
  })

  it('atribución por rol con avatar y nombre corto', () => {
    render(<Attribution task={task({ attribution: {
      verifico: [{ runId: 'r3', provider: 'nomos', agentName: 'UI Builder', at: '' }],
      implemento: [{ runId: 'r1', provider: 'claude', agentName: 'UI Worker', at: '' }],
    } })} />)
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual(['ImplementóClUI Worker', 'VerificóNoUI Builder'])
    expect(screen.getByRole('img', { name: 'UI Worker · Claude' })).toBeInTheDocument()
  })

  it('pestaña Archivo: lista del manifest con enlaces al archivo', async () => {
    vi.mocked(api).mockResolvedValue({ createdAt: '', files: [{ name: 'resumen.md', size: 2048, sha256: 'ab' }, { name: 'informes/1-log.txt', size: 10, sha256: 'cd' }] })
    render(<ArchiveTab taskId="t1" />)
    const link = await screen.findByRole('link', { name: 'informes/1-log.txt' })
    expect(link.getAttribute('href')).toBe('/tasks/t1/archive/informes/1-log.txt?token=tok')
    expect(screen.getByText('2.0 KB')).toBeInTheDocument()
    expect(api).toHaveBeenCalledWith('/tasks/t1/archive')
  })

  it('la cabecera dice «En pausa» con el glifo del director en espera y «Más» ofrece reanudar', async () => {
    vi.mocked(api).mockResolvedValue([])
    const header = <TooltipProvider><Header project="Juego" onCommand={() => {}} onTogglePause={() => {}}
      status={{ service: true, listener: true, listenerAgeSec: 1, director: 's', lastAckSeq: 0, lastAckAt: null, pending: 0, paused: true }} /></TooltipProvider>
    render(<RouterProvider router={createMemoryRouter([{ path: '*', element: header }])} />)
    expect(screen.getByText('En pausa')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Esperando' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Más' }))
    expect(await screen.findByRole('button', { name: 'Reanudar el trabajo' })).toBeInTheDocument()
  })
})
