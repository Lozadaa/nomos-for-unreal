import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Artifact } from '@/lib/tasks'

vi.mock('@/api', () => ({ token: 'fixture-token', api: vi.fn() }))
vi.mock('@google/model-viewer', () => ({}))
import { api } from '@/api'
import { addOptimistic, resetStore } from '@/store'
import { Entregas } from './Entregas'

const mockApi = vi.mocked(api)
const artifact = (id: string, kind: string, path: string): Artifact => ({ id, kind, path, taskId: 't1', license: 'MIT', createdAt: '' })
const inRouter = () => {
  const router = createMemoryRouter([{ path: '/', element: <Entregas /> }])
  return { router, ...render(<RouterProvider router={router} />) }
}

beforeEach(() => { resetStore(); mockApi.mockReset() })
afterEach(cleanup)

describe('Entregas · previews y vacío visual', () => {
  it('usa archivos reales para modelo e imagen, el informe plegado, sin letras de extensión gigantes', async () => {
    mockApi.mockResolvedValue([
      artifact('model', 'model', 'modelo.glb'), artifact('capture', 'screenshot', 'captura.png'),
      artifact('report', 'report', 'informe.txt'), artifact('video', 'video', 'recorrido.mp4'),
    ])
    const { container } = inRouter()
    const image = await screen.findByRole('img', { name: 'Screenshot' })
    expect(image.getAttribute('src')).toBe('/artifacts/capture/file?token=fixture-token')
    expect(image).toHaveAttribute('loading', 'lazy')
    await waitFor(() => expect(container.querySelector('model-viewer')).not.toBeNull())
    const model = container.querySelector('model-viewer')!
    expect(model).toHaveAttribute('alt', '3D model of Model') // hito 7: el nombre del artefacto, nunca el del archivo
    expect(model).toHaveAttribute('src', '/artifacts/model/file?token=fixture-token')
    expect(model).toHaveAttribute('camera-controls')
    expect(model).not.toHaveAttribute('auto-rotate')
    // hito 10: el informe va plegado en «Informes y registros», no como tarjeta
    expect(screen.queryByRole('img', { name: 'Report' })).toBeNull()
    expect(screen.getByText('Reports and logs')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Video' })).toHaveClass('lucide-film')
    expect(screen.queryByText('TXT')).toBeNull()
    expect(screen.queryByText('MP4')).toBeNull()
    expect(screen.queryByText(/MIT|captura\.png|informe\.txt/)).toBeNull()
  })

  it('vacío: un icono de48, una frase y una acción que navega al compositor', async () => {
    mockApi.mockResolvedValue([])
    const { container, router } = inRouter()
    const icon = await screen.findByRole('img', { name: 'Deliveries: empty' })
    expect(icon).toHaveAttribute('width', '48')
    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(screen.getByText('No deliveries yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    await userEvent.setup().click(screen.getByRole('button', { name: 'New request' }))
    await waitFor(() => expect(router.state.location.search).toBe('?nueva=1'))
  })

  it('por tarea: la más reciente primero; las capturas de una comprobación son una tarjeta y el informe queda plegado', async () => {
    for (const [id, title] of [['t1', 'Diseñar HUD'], ['t2', 'Componer plaza']]) addOptimistic({ id, title } as never)
    const shot = (id: string, taskId: string, resolution: string, createdAt: string): Artifact => ({ ...artifact(id, 'screenshot', `C:/d/tests/x/ui-${resolution}.png`), taskId, createdAt,
      runId: 'run12345abcdef', provenance: { resolution, map: '/Game/Maps/Nivel1', testRunId: 'x', check: 'umg' } } as Artifact)
    mockApi.mockResolvedValue([shot('a', 't1', '1280x720', '1'), { ...artifact('r', 'report', 'review-uuid.json'), createdAt: '3' }, shot('b', 't1', '1920x1080', '2'),
      { ...artifact('c', 'report', 'informe.txt'), taskId: 't2', createdAt: '4' }])
    render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <Entregas /> }])} />)
    const groups = await screen.findAllByRole('region')
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Componer plaza', 'Diseñar HUD'])
    expect([...groups[1].querySelectorAll('li p')].map((p) => p.textContent)).toEqual(['UMG · 2 screenshots'])
    expect(groups[1].querySelector('details')!.open).toBe(false)
  })

})
