import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
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
    fireEvent.click(within(card()).getByRole('button', { name: 'Migrar Advanced Cel Shader Lite a Juego' }))
    await waitFor(() => expect(posted()).toEqual([{ type: 'asset.migrate', payload: { entryId: 'cel' }, idempotencyKey: 'migrate:cel:Juego' }]))
    expect(visibleWords(card())).toBeLessThanOrEqual(budgets.catalogCard)
  })

  it('una verificación fallida se ve en la tarjeta', async () => {
    mount(entry())
    fireEvent.click(within(card()).getByRole('button', { name: /^Migrar/ }))
    await waitFor(() => expect(within(card()).getByRole('button', { name: /^Migrar/ })).toHaveTextContent('Verificando'))
    act(() => ingest({ seq: 9, id: 'e9', type: 'asset.verify_failed', messageId: null, payload: { entryId: 'cel' }, createdAt: new Date().toISOString() }))
    expect(within(card()).getByRole('button', { name: /^Migrar/ })).toHaveTextContent('Falló')
  })

  it('instalado en el proyecto actual: sin Migrar; Preparar encola asset.prepare', async () => {
    mount(entry({ state: 'downloaded', source: 'megascans', projects: [] }))
    expect(within(card()).queryByRole('button', { name: /^Migrar/ })).toBeNull()
    fireEvent.click(within(card()).getByRole('button', { name: 'Preparar para Unreal' }))
    await waitFor(() => expect(posted()[0]).toMatchObject({ type: 'asset.prepare', payload: { entryId: 'cel' } }))
    cleanup()
    mount(entry({ state: 'imported', projects: ['Juego'] }))
    expect(within(card()).getByText('Instalado')).toBeInTheDocument()
  })

  it('aviso de versión visible como una palabra y completo en la ayuda (Review Focus 1)', () => {
    expect(versionWarning(['4.20', '5.4'], '5.8.3')).toBe('Publicado para 4.20-5.4; verificado en 5.8.3')
    expect(versionWarning(['5.8'], '5.8.3')).toBeNull()
    mount(entry({ state: 'imported', projects: ['Juego'], verifiedEngine: '5.8.3' }))
    expect(within(card()).getByLabelText('Publicado para 5.4; verificado en 5.8.3')).toHaveTextContent('Versión')
    expect(visibleWords(card())).toBeLessThanOrEqual(budgets.catalogCard)
  })

  it('la miniatura real se pide a /catalog/<id>/thumbnail con el token', () => {
    mount(entry({ thumbnailUrl: '/catalog/cel/thumbnail' }))
    expect(within(card()).getByRole('img', { name: 'Advanced Cel Shader Lite' })).toHaveAttribute('src', '/catalog/cel/thumbnail?token=fixture-token')
  })
})
