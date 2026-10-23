import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Artifact } from '@/lib/tasks'

vi.mock('@/api', () => ({ token: 'tok', api: vi.fn() }))
vi.mock('@google/model-viewer', () => ({}))
import { api } from '@/api'
import { resetStore } from '@/store'
import { artifactName, artifactType } from '@/lib/artifactName'
import { countWords } from '@/visual/text-budget'
import { Entregas } from './Entregas'

const a = (id: string, kind: string, path: string, provenance: Record<string, unknown> = {}, extra: Partial<Artifact> = {}): Artifact =>
  ({ id, kind, path, taskId: 't1', license: null, createdAt: id, provenance, ...extra })
const cpp = a('3', 'report', 'C:/k/.kratos/artifacts/tests/u1/log.txt', { check: 'cpp', testRunId: 'u1' })
const fixtures = [
  cpp,
  a('1', 'screenshot', 'C:/k/tests/u2/HighresScreenshot00000.png', { check: 'umg', resolution: '1280x720' }),
  a('2', 'report', 'review-6cb4cfe7-f945-496e-9ba3-ecc50cc54107.json', { approved: true }),
  a('4', 'build', 'C:/Builds/Windows/KratosFabTest.exe', { check: 'build' }),
  a('5', 'model', 'C:/k/meshy/r1/model.glb', { provider: 'meshy', label: 'Modelo Meshy · caja de munición' }),
]
const at = (path = '/') => {
  const router = createMemoryRouter([{ path: '/', element: <Entregas /> }], { initialEntries: [path] })
  return { router, ...render(<RouterProvider router={router} />) }
}
const names = () => screen.getAllByRole('listitem').map((li) => li.querySelector('p')!.textContent)

beforeEach(() => { resetStore(); vi.mocked(api).mockReset(); vi.mocked(api).mockResolvedValue(fixtures) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Entregas · nombres, filtro y orden (corrección del usuario)', () => {
  it('nombre derivado: nunca log.txt, review-<uuid> ni rutas; la etiqueta del servicio manda', () => {
    expect(artifactName(cpp)).toBe('Compilación C++ · registro')
    expect(artifactName(a('x', 'report', 'C:/t/log.txt', { check: 'build' }))).toBe('Empaquetado · registro')
    expect(artifactName(fixtures[3])).toBe('Empaquetado · KratosFabTest.exe')
    expect(artifactName(fixtures[1])).toBe('Captura UMG 1280×720')
    expect(artifactName(a('x', 'screenshot', 's.png', { check: 'map', resolution: '1280x720' }))).toBe('Captura de control 1280×720')
    expect(artifactName(fixtures[2])).toBe('Revisión · informe')
    expect(artifactName(a('x', 'report', 'r.json', { label: 'QA visual · informe' }))).toBe('QA visual · informe')
    expect(artifactName(a('x', 'report', 'C:/k/migrate/report.json', { entryId: 'e1' }))).toBe('Verificación de pack · informe')
    expect(artifactName(fixtures[4])).toBe('Modelo Meshy · caja de munición')
    expect(fixtures.map(artifactType)).toEqual(['registros', 'capturas', 'informes', 'compilaciones', 'modelos'])
  })

  it('más recientes por defecto; cada tarjeta ≤ 6 palabras y el archivo y la ruta en el tooltip', async () => {
    at()
    await screen.findByText('Compilación C++ · registro')
    expect(names()).toEqual(['Modelo Meshy · caja de munición', 'Empaquetado · KratosFabTest.exe', 'Compilación C++ · registro', 'Revisión · informe', 'Captura UMG 1280×720'])
    for (const name of names()) expect(countWords(name!)).toBeLessThanOrEqual(6)
    expect(screen.queryByText(/log\.txt|review-|C:\//)).toBeNull()
    expect(screen.getByText('Compilación C++ · registro').closest('li')!.getAttribute('title')).toMatch(/^log\.txt\nC:\/k\/\.kratos\/artifacts\/tests\/u1\/log\.txt/)
  })

  it('filtro por tipo con el ToggleGroup de Catálogo, recordado en la URL', async () => {
    const { router } = at()
    await screen.findByText('Compilación C++ · registro')
    await userEvent.click(screen.getByRole('button', { name: 'Registros' }))
    await waitFor(() => expect(router.state.location.search).toBe('?tipo=registros'))
    expect(names()).toEqual(['Compilación C++ · registro'])
    await userEvent.click(screen.getByRole('button', { name: 'Capturas' }))
    expect(names()).toEqual(['Captura UMG 1280×720'])
    await userEvent.click(screen.getByRole('button', { name: 'Todos' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('orden por tipo en la URL: capturas, modelos, compilaciones, informes, registros', async () => {
    const { router } = at()
    await screen.findByText('Compilación C++ · registro')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ordenar entregas' }), 'tipo')
    await waitFor(() => expect(router.state.location.search).toBe('?orden=tipo'))
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Capturas', 'Modelos', 'Compilaciones', 'Informes', 'Registros'])
  })

  it('un registro de compilación enseña sus dos primeras líneas con «error» en mono 11 px', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Building...\nVida.cpp(12): error C2065: vida no declarada\nnota\nVida.cpp(13): error C2143: falta ;\nVida.cpp(14): error C1004')))
    at('/?tipo=registros')
    const card = (await screen.findByText('Compilación C++ · registro')).closest('li')!
    const pre = await within(card).findByLabelText('Primeros errores')
    expect(pre.textContent).toBe('Vida.cpp(12): error C2065: vida no declarada\nVida.cpp(13): error C2143: falta ;')
    expect(pre).toHaveClass('font-mono', 'text-[11px]')
    expect(within(card).getByRole('img', { name: 'Informe' })).toHaveClass('lucide-file-text')
  })
})
