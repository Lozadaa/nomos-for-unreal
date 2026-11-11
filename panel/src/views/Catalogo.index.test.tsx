import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@/api', () => {
  class ApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  }
  return { api: vi.fn(), ApiError }
})
vi.mock('@/feel/toasts', () => ({ toasts: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { api } from '@/api'
import { toasts } from '@/feel/toasts'
import { ingest, resetStore } from '@/store'
import { CommandMenu } from '@/shell/CommandMenu'
import { useCatalogIndexedToast } from '@/hooks/assetCommands'
import { Catalogo } from './Catalogo'

const mount = (element: React.ReactNode) =>
  render(<TooltipProvider><RouterProvider router={createMemoryRouter([{ path: '*', element }])} /></TooltipProvider>)
const indexCall = () => vi.mocked(api).mock.calls.find(([path, init]) => path === '/commands' && init?.method === 'POST')

beforeEach(() => { resetStore(); vi.mocked(api).mockReset(); vi.mocked(toasts.success).mockClear() })
afterEach(cleanup)

describe('Catálogo · Indexar ahora', () => {
  it('el botón de la cabecera encola asset.index con clave por minuto', async () => {
    vi.mocked(api).mockImplementation(async (path: string) => path === '/catalog' ? [] : { commandId: 'c1' })
    mount(<Catalogo />)
    fireEvent.click(await screen.findByRole('button', { name: 'Index now' }))
    await waitFor(() => expect(indexCall()).toBeDefined())
    const body = indexCall()![1]!.body as { type: string; idempotencyKey: string }
    expect(body.type).toBe('asset.index')
    expect(body.idempotencyKey).toMatch(/^asset\.index:\d{4}-\d\d-\d\dT\d\d:\d\d$/)
  })

  it('⌘K › Indexar está habilitado y encola la misma orden', async () => {
    vi.mocked(api).mockResolvedValue({ commandId: 'c1' })
    mount(<CommandMenu />)
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const item = await screen.findByText('Index catalog')
    expect(item).toHaveAttribute('aria-disabled', 'false')
    fireEvent.click(item)
    await waitFor(() => expect((indexCall()![1]!.body as { type: string }).type).toBe('asset.index'))
  })

  it('un catalog.indexed nuevo da un toast con el recuento; el historial no', () => {
    const Probe = () => { useCatalogIndexedToast(); return null }
    act(() => ingest({ seq: 1, id: 'old', type: 'catalog.indexed', messageId: null, payload: { entries: 3 }, createdAt: '2026-01-01T00:00:00Z' }))
    render(<Probe />)
    expect(toasts.success).not.toHaveBeenCalled()
    act(() => ingest({ seq: 2, id: 'new', type: 'catalog.indexed', messageId: null, payload: { entries: 8 }, createdAt: new Date().toISOString() }))
    expect(toasts.success).toHaveBeenCalledWith({ title: 'Catalog indexed', description: '8 assets in the catalog' })
  })
})
