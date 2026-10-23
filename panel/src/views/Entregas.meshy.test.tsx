import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('@/api', () => ({ api: vi.fn(), ApiError: class extends Error {}, token: 't' }))
vi.mock('@/feel/toasts', () => ({ toasts: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { api } from '@/api'
import { resetStore } from '@/store'
import { Entregas } from './Entregas'

const expired = { id: 'a1', taskId: 't1', kind: 'model', path: 'C:/k/artifacts/meshy/r1/model.glb', license: 'Meshy (según plan)', createdAt: '',
  previewPath: null, provenance: { provider: 'meshy', kind: 'text', params: { prompt: 'caja de munición', mode: 'preview' }, estimatedCredits: 20, taskId: 't1' } }

beforeEach(() => { resetStore(); vi.mocked(api).mockReset() })
afterEach(cleanup)

describe('Entregas · Meshy sin copia', () => {
  it('muestra «Enlace vencido y sin copia» y Regenerar encola asset.meshy_generate con los mismos parámetros', async () => {
    vi.mocked(api).mockImplementation(async (path: string) => path === '/artifacts' ? [expired] : { commandId: 'c' })
    render(<MemoryRouter><Entregas /></MemoryRouter>)
    expect(await screen.findByText('Enlace vencido y sin copia')).toBeInTheDocument()
    expect(screen.getByText('Modelo Meshy · caja de munición')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Regenerar' }))
    await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith('/commands', expect.objectContaining({ method: 'POST' })))
    const body = vi.mocked(api).mock.calls.find(([p]) => p === '/commands')![1]!.body as Record<string, any>
    expect(body).toMatchObject({ type: 'asset.meshy_generate', payload: { taskId: 't1', kind: 'text', params: { prompt: 'caja de munición', mode: 'preview' }, estimatedCredits: 20 } })
    expect(body.idempotencyKey).toMatch(/^meshy:a1:/)
  })
})
