import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Artifact } from '@/lib/tasks'

vi.mock('@/api', () => ({ token: 'fixture-token', api: vi.fn() }))
vi.mock('@google/model-viewer', () => ({}))
import { api } from '@/api'
import { resetStore } from '@/store'
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
  it('usa archivos reales para modelo e imagen y FileText para informe, sin letras de extensión gigantes', async () => {
    mockApi.mockResolvedValue([
      artifact('model', 'model', 'modelo.glb'), artifact('capture', 'screenshot', 'captura.png'),
      artifact('report', 'report', 'informe.txt'), artifact('video', 'video', 'recorrido.mp4'),
    ])
    const { container } = inRouter()
    const image = await screen.findByRole('img', { name: 'captura.png' })
    expect(image.getAttribute('src')).toBe('/artifacts/capture/file?token=fixture-token')
    expect(image).toHaveAttribute('loading', 'lazy')
    await waitFor(() => expect(container.querySelector('model-viewer')).not.toBeNull())
    const model = container.querySelector('model-viewer')!
    expect(model).toHaveAttribute('alt', 'Modelo 3D de modelo.glb')
    expect(model).toHaveAttribute('src', '/artifacts/model/file?token=fixture-token')
    expect(model).toHaveAttribute('camera-controls')
    expect(model).not.toHaveAttribute('auto-rotate')
    expect(screen.getByRole('img', { name: 'Informe' })).toHaveAttribute('width', '48')
    expect(screen.getByRole('img', { name: 'Informe' })).toHaveClass('lucide-file-text')
    expect(screen.getByRole('img', { name: 'Vídeo' })).toHaveClass('lucide-film')
    expect(screen.queryByText('TXT')).toBeNull()
    expect(screen.queryByText('MP4')).toBeNull()
    expect(screen.getAllByText(/MIT/)).toHaveLength(4)
  })

  it('vacío: un icono de48, una frase y una acción que navega al compositor', async () => {
    mockApi.mockResolvedValue([])
    const { container, router } = inRouter()
    const icon = await screen.findByRole('img', { name: 'Entregas sin elementos' })
    expect(icon).toHaveAttribute('width', '48')
    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(screen.getByText('Aún no hay entregas')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Nueva petición' }))
    await waitFor(() => expect(router.state.location.search).toBe('?nueva=1'))
  })
})
