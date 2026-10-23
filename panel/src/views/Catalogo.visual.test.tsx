import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { catalogThumbnailUrl } from '@/lib/catalogVisual'
import { budgets, countWords, truncateWords, visibleWords } from '@/visual/text-budget'

vi.mock('@/api', () => {
  class ApiError extends Error {
    status: number
    constructor(status: number, message: string) { super(message); this.status = status }
  }
  return { api: vi.fn(), ApiError }
})
vi.mock('@/feel/toasts', () => ({ toasts: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { api, ApiError } from '@/api'
import { toasts } from '@/feel/toasts'
import { CatalogCard, Catalogo, type CatalogEntry } from './Catalogo'

const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id: 'asset', name: 'Advanced Cel Shader Lite', category: 'shader', description: 'Material de ejemplo', source: 'fab', state: 'owned', projects: [],
  formats: ['glb'], engineVersions: ['5.8'], license: 'Licencia de ejemplo completa', aiForbidden: 0, tags: [], ...over,
})
const mountCard = (value = entry()) => render(<TooltipProvider><ul><CatalogCard entry={value} /></ul></TooltipProvider>)
const card = () => document.querySelector<HTMLElement>('[data-catalog-card]')!

beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(toasts.error).mockClear(); vi.mocked(toasts.success).mockClear() })
afterEach(cleanup)

describe('Catálogo · tarjetas visuales', () => {
  it('comparte tokenizador al contar y truncar texto sin cortar palabras internas', () => {
    const text = 'Advanced/Cel Shader_Lite UI-worker 🎾'
    expect(countWords(text)).toBe(4)
    expect(truncateWords(text, 2)).toBe('Advanced/Cel…')
    expect(truncateWords('Free_Tennisball 🎾', 1)).toBe('Free_Tennisball 🎾')
    expect(truncateWords(text, 0)).toBe('')
  })

  it('deja nombre, fuente y acción visibles con cinco palabras incluyendo todo el título', () => {
    mountCard()
    expect(card()).not.toBeNull()
    expect(visibleWords(card())).toBeLessThanOrEqual(budgets.catalogCard)
    expect(within(card()).getByRole('heading', { name: 'Advanced Cel Shader Lite' })).toHaveTextContent('Advanced Cel Shader…')
    expect(within(card()).getByRole('img', { name: 'Fab' })).toHaveTextContent('Fab')
    expect(within(card()).getByRole('button', { name: 'Preparar para Unreal' })).toHaveTextContent('Preparar')
    expect(within(card()).getByRole('img', { name: 'Assets' })).toBeInTheDocument()
  })

  it('mantiene el presupuesto en todas las fuentes y estados, incluida No IA con Poly Haven', () => {
    const sources = ['fab', 'megascans', 'polyhaven', 'ambientcg', 'kenney', 'quaternius', 'sketchfab', 'freesound', 'meshy', 'blender']
    for (const source of sources) for (const state of [{}, { license: null }, { state: 'imported' as const, projects: ['CrazyPadel'] }, { aiForbidden: 1 as const }]) {
      const view = mountCard(entry({ source, ...state }))
      expect(visibleWords(card()), `${source}:${JSON.stringify(state)}`).toBeLessThanOrEqual(5)
      expect(within(card()).getByRole('heading', { name: 'Advanced Cel Shader Lite' }).textContent?.trim()).not.toBe('')
      if (state.aiForbidden) {
        expect(within(card()).getByText(source === 'polyhaven' ? 'No IA' : 'Prohibido para IA')).toBeInTheDocument()
        expect(within(card()).queryByRole('button')).toBeNull()
      }
      view.unmount()
    }
  })

  it('muestra proyectos y licencia completa bajo demanda fuera de la tarjeta', async () => {
    mountCard(entry({ license: null, source: 'polyhaven' }))
    const trigger = screen.getByRole('button', { name: 'Revisar licencia' })
    await userEvent.setup().click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Revisar licencia' })
    expect(dialog).toHaveTextContent('Advanced Cel Shader Lite')
    expect(dialog).toHaveTextContent(/La licencia no está declarada/)
    expect(card().contains(dialog)).toBe(false)
    expect(visibleWords(card())).toBeLessThanOrEqual(5)
    expect(vi.mocked(api).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
    await userEvent.setup().keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('preparar mantiene pendiente, error visible breve y reintento con contexto completo', async () => {
    vi.mocked(api).mockRejectedValueOnce(new ApiError(404, 'not_found')).mockResolvedValueOnce({ id: 'command' })
    mountCard(entry({ source: 'polyhaven' }))
    const user = userEvent.setup()
    const prepare = screen.getByRole('button', { name: 'Preparar para Unreal' })
    await user.click(prepare)
    expect(await screen.findByRole('button', { name: 'Preparando…' })).toHaveAttribute('aria-busy', 'true')
    expect(visibleWords(card())).toBeLessThanOrEqual(5)
    const retry = await screen.findByRole('button', { name: /Reintentar preparación/ })
    expect(retry).toHaveTextContent('Reintentar')
    expect(retry).toHaveFocus()
    expect(visibleWords(card())).toBeLessThanOrEqual(5)
    expect(toasts.error).toHaveBeenCalled()
    await user.hover(retry)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Disponible cuando el ejecutor de comandos esté listo.')
    expect(retry).toHaveAccessibleDescription('Disponible cuando el ejecutor de comandos esté listo.')
    await user.click(retry)
    await waitFor(() => expect(retry).toHaveTextContent('Pendiente'))
    expect(retry).toHaveAttribute('aria-disabled', 'true')
    expect(retry).toHaveFocus()
    expect(visibleWords(card())).toBeLessThanOrEqual(5)
    expect(vi.mocked(api)).toHaveBeenCalledWith('/commands', expect.objectContaining({ method: 'POST', body: expect.objectContaining({ payload: { entryId: 'asset' } }) }))
  })

  it('acepta miniaturas camelCase y snake_case, y cae al pictograma si falla la imagen', () => {
    for (const property of ['thumbnailPath', 'thumbnail_path']) {
      const view = mountCard(entry({ [property]: '/preview.png' }))
      const image = within(card()).getByRole('img', { name: 'Advanced Cel Shader Lite' })
      expect(image).toHaveAttribute('src', '/preview.png')
      fireEvent.error(image)
      expect(within(card()).queryByRole('img', { name: 'Advanced Cel Shader Lite' })).toBeNull()
      expect(within(card()).getByRole('img', { name: 'Assets' })).toBeInTheDocument()
      view.unmount()
    }
  })

  it.each(['C:\\assets\\photo.png', 'file:///tmp/photo.png', 'https://other.example/photo.png', '/tmp/photo.png'])('no pide paths nativos o externos: %s', (path) => {
    mountCard(entry({ thumbnailPath: path, category: 'audio' }))
    expect(within(card()).getByRole('img', { name: 'Audio' })).toBeInTheDocument()
    expect(card().querySelector('img')).toBeNull()
  })

  it('ofrece pedir un asset en el catálogo vacío y conserva la navegación del panel', async () => {
    vi.mocked(api).mockResolvedValue([])
    const router = createMemoryRouter([{ path: '/catalogo', element: <Catalogo /> }, { path: '/', element: <p>Nueva petición</p> }], { initialEntries: ['/catalogo'] })
    render(<RouterProvider router={router} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Pedir un asset' }))
    await waitFor(() => expect(router.state.location.pathname + router.state.location.search).toBe('/?nueva=1'))
    expect(vi.mocked(api).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  })
})

describe('miniaturas del catálogo · URL servible del mismo origen', () => {
  it('admite rutas raíz y HTTP(S) del propio origen, no rutas relativas de disco o protocolos embebidos', () => {
    const origin = 'http://localhost:18791'
    expect(catalogThumbnailUrl('/preview/asset.png', origin)).toBe('/preview/asset.png')
    expect(catalogThumbnailUrl(`${origin}/preview.png`, origin)).toBe(`${origin}/preview.png`)
    for (const path of [null, '', 'photo.png', '../photo.png', '~/photo.png', '/Users/richa/photo.png', 'C:/assets/photo.png', '\\\\server\\photo.png', '//other.example/a.png', 'data:image/png;base64,xx', 'blob:photo', 'https://other.example/a.png']) {
      expect(catalogThumbnailUrl(path, origin), String(path)).toBeNull()
    }
  })
})
