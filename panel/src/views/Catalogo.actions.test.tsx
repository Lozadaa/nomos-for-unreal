import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@/api', () => {
  class ApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  }
  return { api: vi.fn(), ApiError, token: 'fixture-token' }
})
vi.mock('@/feel/toasts', () => ({ toasts: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { api } from '@/api'
import { ingest, resetStore } from '@/store'
import { budgets, visibleWords } from '@/visual/text-budget'
import { CatalogCard, type CatalogEntry } from './Catalogo'
import { versionWarning } from './CatalogActions'
import { PendingDownloads } from './PendingDownloads'

const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id: 'cel', name: 'Advanced Cel Shader Lite', category: 'pack', description: '', source: 'fab', state: 'cached', projects: ['KratosFabTest'],
  formats: ['uasset'], engineVersions: ['5.4'], license: 'Fab Standard License', aiForbidden: 0, tags: [], ...over,
})
const mount = (value: CatalogEntry, project = 'Juego') => render(<TooltipProvider><ul><CatalogCard entry={value} project={project} /></ul></TooltipProvider>)
const posted = () => vi.mocked(api).mock.calls.filter(([path, init]) => path === '/commands' && init?.method === 'POST').map(([, init]) => init!.body as { type: string; payload: { entryId: string }; idempotencyKey: string })
const card = () => document.querySelector<HTMLElement>('[data-catalog-card]')!

beforeEach(() => { resetStore(); vi.mocked(api).mockReset(); vi.mocked(api).mockResolvedValue({ commandId: 'c1' }) })
afterEach(cleanup)

describe('Catálogo · migrar y preparar', () => {
  it('un pack en caché o instalado en otro proyecto ofrece Migrar y encola asset.migrate', async () => {
    mount(entry({ state: 'imported' }))
    fireEvent.click(within(card()).getByRole('button', { name: 'Migrate Advanced Cel Shader Lite to Juego' }))
    await waitFor(() => expect(posted()).toEqual([{ type: 'asset.migrate', payload: { entryId: 'cel' }, idempotencyKey: 'migrate:cel:Juego' }]))
    expect(visibleWords(card())).toBeLessThanOrEqual(budgets.catalogCard)
  })

  it('una verificación fallida se ve en la tarjeta', async () => {
    mount(entry())
    fireEvent.click(within(card()).getByRole('button', { name: /^Migrate/ }))
    await waitFor(() => expect(within(card()).getByRole('button', { name: /^Migrate/ })).toHaveTextContent('Verifying'))
    act(() => ingest({ seq: 9, id: 'e9', type: 'asset.verify_failed', messageId: null, payload: { entryId: 'cel' }, createdAt: new Date().toISOString() }))
    expect(within(card()).getByRole('button', { name: /^Migrate/ })).toHaveTextContent('Failed')
  })

  it('instalado en el proyecto actual: sin Migrar; Preparar encola asset.prepare', async () => {
    mount(entry({ state: 'downloaded', source: 'megascans', projects: [] }))
    expect(within(card()).queryByRole('button', { name: /^Migrate/ })).toBeNull()
    fireEvent.click(within(card()).getByRole('button', { name: 'Prepare for Unreal' }))
    await waitFor(() => expect(posted()[0]).toMatchObject({ type: 'asset.prepare', payload: { entryId: 'cel' } }))
    cleanup()
    mount(entry({ state: 'imported', projects: ['Juego'] }))
    expect(within(card()).getByText('Installed')).toBeInTheDocument()
  })

  it('aviso de versión visible como una palabra y completo en la ayuda (Review Focus 1)', () => {
    expect(versionWarning(['4.20', '5.4'], '5.8.3')).toBe('Published for 4.20-5.4; verified on 5.8.3')
    expect(versionWarning(['5.8'], '5.8.3')).toBeNull()
    mount(entry({ state: 'imported', projects: ['Juego'], verifiedEngine: '5.8.3' }))
    expect(within(card()).getByLabelText('Published for 5.4; verified on 5.8.3')).toHaveTextContent('Version')
    expect(visibleWords(card())).toBeLessThanOrEqual(budgets.catalogCard)
  })

  it('la miniatura real se pide a /catalog/<id>/thumbnail con el token', () => {
    mount(entry({ thumbnailUrl: '/catalog/cel/thumbnail' }))
    expect(within(card()).getByRole('img', { name: 'Advanced Cel Shader Lite' })).toHaveAttribute('src', '/catalog/cel/thumbnail?token=fixture-token')
  })
})

describe('Catálogo · descargas asistidas (nivel 2)', () => {
  it('en tu biblioteca de Fab y sin disco: Descargar encola asset.request_download', async () => {
    mount(entry({ state: 'owned', fabUid: 'ff0ac933', projects: [] }))
    expect(within(card()).queryByRole('button', { name: /^Migrate/ })).toBeNull()
    fireEvent.click(within(card()).getByRole('button', { name: 'Download Advanced Cel Shader Lite from Fab' }))
    await waitFor(() => expect(posted()[0]).toMatchObject({ type: 'asset.request_download', payload: { entryId: 'cel' } }))
    expect(visibleWords(card())).toBeLessThanOrEqual(budgets.catalogCard)
  })

  it('Descargas pendientes muestra las instrucciones y «Ya lo añadí» adelanta la comprobación', async () => {
    vi.mocked(api).mockImplementation(async (path: string) => path.startsWith('/downloads?')
      ? [{ id: 'd1', entryId: 'cel', name: 'Advanced Cel Shader Lite', state: 'pending', instructions: 'Fab › My Library › busca "Advanced Cel Shader Lite"', requestedAt: '' }]
      : {})
    render(<TooltipProvider><PendingDownloads /></TooltipProvider>)
    const section = await screen.findByRole('region', { name: 'Pending downloads' })
    expect(within(section).getByText(/Fab › My Library/)).toBeInTheDocument()
    fireEvent.click(within(section).getByRole('button', { name: 'I’ve added it' }))
    await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith('/downloads/d1/check', { method: 'POST', body: {} }))
  })
})
