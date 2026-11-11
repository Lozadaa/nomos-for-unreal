import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Artifact } from '@/lib/tasks'

vi.mock('@/api', () => ({ token: 'tok', api: vi.fn() }))
vi.mock('@google/model-viewer', () => ({}))
import { api } from '@/api'
import { addOptimistic, resetStore } from '@/store'
import { artifactName } from '@/lib/artifactName'
import { countWords } from '@/visual/text-budget'
import { Entregas } from './Entregas'

const a = (id: string, kind: string, path: string, provenance: Record<string, unknown> = {}, extra: Partial<Artifact> = {}): Artifact =>
  ({ id, kind, path, taskId: 't1', license: null, createdAt: `2026-10-24T10:00:${id.padStart(2, '0')}Z`, provenance, ...extra })
const run = { check: 'map', testRunId: '7d1e2a4b-0000-4000-8000-000000000001', resolution: '1280x720', map: '/Game/Mapas/L_Gym' }
const views = ['player', 'left', 'right', 'top'].map((view, i) => a(String(10 + i), 'screenshot', `C:/k/tests/7d1e/map-${view}.png`, { ...run, view }))
const fixtures = [
  ...views,
  a('20', 'screenshot', 'C:/k/tests/7d1e/map-hoja.jpg', { ...run, sheet: true }),
  a('21', 'video', 'C:/k/tests/x/anim.mp4', { label: 'Animación · ataque', seconds: 3.67 }, { previewPath: 'C:/k/tests/x/anim-50.png' }),
  a('22', 'model', 'C:/k/meshy/m.glb', { label: 'Modelo · caja' }),
  a('23', 'report', 'C:/k/tests/7d1e/log.txt', { check: 'cpp', testRunId: run.testRunId, result: 'failed' }),
  a('24', 'report', 'C:/k/review-6cb4cfe7-f945-496e-9ba3-ecc50cc54107.json', { kind: 'REVIEW', approved: false, findings: [{}, {}] }),
  a('25', 'build', 'C:/Builds/Windows/Esquina.exe', { check: 'build', label: 'Empaquetado · Esquina.exe' }),
  a('01', 'screenshot', 'C:/k/tests/old/HighresScreenshot00000.png', { check: 'umg', resolution: '1920x1080' }, { taskId: 't0' }),
]
const at = (path = '/') => {
  const router = createMemoryRouter([{ path: '/', element: <Entregas /> }], { initialEntries: [path] })
  return { router, ...render(<RouterProvider router={router} />) }
}
const ids = /[0-9a-f]{8}-[0-9a-f]{4}|\.(png|jpe?g|json|txt|exe|glb|mp4)\b|C:\//
const log = "Building…\nVida.cpp(12): error C2065: 'Vida' no declarado\nVida.cpp(13): error C2143\n"

beforeEach(() => {
  resetStore(); vi.mocked(api).mockReset(); vi.mocked(api).mockResolvedValue(fixtures)
  for (const [id, title] of [['t1', 'Componer plaza'], ['t0', 'Diseñar HUD']]) addOptimistic({ id, title } as never)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(log)))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Entregas para mirar (hito 10)', () => {
  it('por tarea por defecto, la más reciente arriba; primero lo visual, luego modelos y al final los informes plegados', async () => {
    at()
    const sections = await screen.findAllByRole('region')
    expect(sections.map((s) => s.getAttribute('aria-label'))).toEqual(['Componer plaza', 'Diseñar HUD'])
    const parts = [...sections[0].querySelectorAll('[data-part]')].map((p) => p.getAttribute('data-part'))
    expect(parts).toEqual(['visuales', 'modelos', 'informes'])
    expect(sections[0].querySelector('details')!.open).toBe(false)
    expect(within(sections[0]).getByText('Reports and logs')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sort deliveries' })).toHaveValue('tarea')
  })

  it('una comprobación con cuatro vistas es una tarjeta con su hoja de contactos; ni archivos ni uuids en pantalla', async () => {
    at()
    const card = (await screen.findByText('Map · 4 views')).closest('li')!
    expect(within(card).getByRole('img', { name: 'Map · 4 views' }).getAttribute('src')).toContain('/artifacts/20/file')
    for (const li of document.querySelectorAll('li')) expect(countWords(li.textContent ?? '')).toBeLessThanOrEqual(6)
    expect(document.body.textContent).not.toMatch(ids)
  })

  it('el visor muestra la galería de ángulos: miniaturas abajo y flechas entre vistas', async () => {
    const user = userEvent.setup()
    at()
    await user.click(await screen.findByRole('button', { name: 'View Map · 4 views full size' }))
    const dialog = await screen.findByRole('dialog', { name: 'Map · Player' })
    const strip = within(dialog).getByRole('group', { name: 'Angles' })
    expect(within(strip).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Player', '3/4 left', '3/4 right', 'Top-down'])
    expect(within(strip).getByRole('button', { name: 'Player' })).toHaveAttribute('aria-current', 'true')
    await user.click(within(strip).getByRole('button', { name: 'Top-down' }))
    expect(await screen.findByRole('dialog', { name: 'Map · Top-down' })).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(await screen.findByRole('dialog', { name: 'Map · 3/4 right' })).toBeInTheDocument()
    expect(screen.getByRole('dialog').textContent).not.toMatch(ids)
  })

  it('el vídeo enseña su fotograma y su duración', async () => {
    at()
    const card = (await screen.findByText('Animación · ataque')).closest('li')!
    expect(within(card).getByRole('img', { name: 'Animación · ataque' }).getAttribute('src')).toContain('/artifacts/21/preview')
    expect(within(card).getByText('0:04')).toBeInTheDocument()
  })

  it('hito 19: un paquete retirado por la limpieza dice «paquete retirado» y no ofrece abrirlo', async () => {
    const user = userEvent.setup()
    vi.mocked(api).mockResolvedValue([a('30', 'build', 'C:/k/tests/9f/build/Windows/Esquina.exe', { check: 'build', label: 'Empaquetado · Esquina.exe', removed: true })])
    at()
    const section = (await screen.findAllByRole('region'))[0]
    await user.click(within(section).getByText('Reports and logs'))
    const list = within(section).getByRole('list', { name: 'Reports and logs' })
    expect(within(list).getByText('Package · removed (only the current build is kept)')).toBeInTheDocument()
    expect(within(list).queryByRole('link', { name: 'Open original' })).toBeNull()
    expect(list.className).not.toMatch(/text-error/)
  })

  it('al desplegar, cada informe es una línea con su veredicto, el primer error si falló y «Abrir original»', async () => {
    const user = userEvent.setup()
    at()
    const section = (await screen.findAllByRole('region'))[0]
    await user.click(within(section).getByText('Reports and logs'))
    const list = within(section).getByRole('list', { name: 'Reports and logs' })
    await waitFor(() => expect(within(list).getByText('C++ build · 2 errors')).toBeInTheDocument())
    expect(within(list).getByText('Review · 2 findings')).toBeInTheDocument()
    expect(within(list).getByText('Package · executable ready')).toBeInTheDocument()
    expect(within(list).getByText(/error C2065/)).toBeInTheDocument()
    expect(within(list).getAllByRole('link', { name: 'Open original' })).toHaveLength(3)
    expect(list.querySelector('pre')).toBeNull()
  })

  it('filtro por tipo: Todos, Capturas, Vídeos, Modelos e Informes, recordado en la URL', async () => {
    const user = userEvent.setup()
    const { router } = at()
    await screen.findAllByRole('region')
    expect(within(screen.getByRole('group', { name: 'Filter by type' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'Screenshots', 'Videos', 'Models', 'Reports'])
    await user.click(screen.getByRole('button', { name: 'Videos' }))
    await waitFor(() => expect(router.state.location.search).toBe('?tipo=videos'))
    expect(screen.getAllByRole('region')).toHaveLength(1)
    expect(screen.queryByText('Map · 4 views')).toBeNull()
    expect(screen.getByText('Animación · ataque')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reports' }))
    expect(screen.getByText('Reports and logs')).toBeInTheDocument()
  })

  it('nombre derivado: nunca log.txt, review-<uuid> ni rutas; la etiqueta del servicio manda', () => {
    expect(artifactName(a('x', 'report', 'C:/k/.nomos/artifacts/tests/u1/log.txt', { check: 'cpp' }))).toBe('C++ build · log')
    expect(artifactName(a('x', 'screenshot', 's.png', { check: 'umg', resolution: '1280x720' }))).toBe('UMG screenshot 1280×720')
    expect(artifactName(a('x', 'report', 'review-6cb4.json', { approved: true }))).toBe('Review · report')
    expect(artifactName(a('x', 'report', 'r.json', { label: 'QA visual · informe' }))).toBe('QA visual · informe')
  })
})

it('hito 23: los hallazgos del revisor son filas con chip de severidad y la nota; archivo y línea en el tooltip', async () => {
  const user = userEvent.setup()
  vi.mocked(api).mockResolvedValue([a('24', 'report', 'C:/k/review-6cb4.json', { kind: 'REVIEW', approved: false,
    findings: [{ file: 'Source/Juego/Vida.cpp', line: 12, severity: 'error', note: 'La vida no baja al recibir el golpe' }] })])
  at()
  const section = (await screen.findAllByRole('region'))[0]
  await user.click(within(section).getByText('Reports and logs'))
  const rows = within(section).getByRole('list', { name: 'Findings' })
  const row = within(rows).getByText('La vida no baja al recibir el golpe').closest('li')!
  expect(within(row).getByText('error')).toBeInTheDocument()
  expect(row).toHaveAttribute('title', 'Source/Juego/Vida.cpp:12')
})
