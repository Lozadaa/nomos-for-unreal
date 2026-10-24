import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Artifact } from '@/lib/tasks'

vi.mock('@/api', () => ({ token: 'tok', api: vi.fn() }))
vi.mock('@google/model-viewer', () => ({}))
import { api } from '@/api'
import { resetStore } from '@/store'
import { Entregas } from '@/views/Entregas'

const a = (id: string, kind: string, path: string, provenance: Record<string, unknown> = {}): Artifact =>
  ({ id, kind, path, taskId: 't1', license: 'CC0', createdAt: id, provenance })
// el informe queda entre las dos capturas por fecha: con el filtro «Capturas» el visor salta de una a otra
const fixtures = [
  a('3', 'screenshot', 'C:/k/tests/u3/HighresScreenshot00001.png', { check: 'map', resolution: '1920x1080' }),
  a('2', 'report', 'review-6cb4cfe7-f945-496e-9ba3-ecc50cc54107.json', { approved: true }),
  a('1', 'screenshot', 'C:/k/tests/u2/HighresScreenshot00000.png', { check: 'umg', resolution: '1280x720' }),
]
const at = (path: string) => render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <Entregas /> }], { initialEntries: [path] })} />)

beforeEach(() => { resetStore(); vi.mocked(api).mockReset(); vi.mocked(api).mockResolvedValue(fixtures) })
afterEach(() => cleanup())

describe('Visor de assets (corrección 3 del usuario)', () => {
  it('la miniatura abre el visor con la imagen entera (object-contain) y el nombre derivado como título', async () => {
    const user = userEvent.setup()
    at('/')
    await user.click(await screen.findByRole('button', { name: 'Ver Captura UMG 1280×720 a tamaño completo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Captura UMG 1280×720' })
    const img = within(dialog).getByRole('img', { name: 'Captura UMG 1280×720' })
    expect(img.className).toContain('object-contain')
    expect(img.className).not.toContain('object-cover')
    expect(within(dialog).getByRole('heading').textContent).not.toMatch(/Highres|\.png|[0-9a-f]{8}-/)
    expect(within(dialog).getByText(/HighresScreenshot00000\.png/)).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Abrir original' })).toHaveAttribute('href', expect.stringContaining('token=tok'))
  })

  it('Esc cierra el visor y el foco vuelve a la miniatura que lo abrió', async () => {
    const user = userEvent.setup()
    at('/')
    const thumb = await screen.findByRole('button', { name: 'Ver Captura UMG 1280×720 a tamaño completo' })
    await user.click(thumb)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(thumb).toHaveFocus())
  })

  it('→ pasa al siguiente del listado tal como está filtrado y ordenado', async () => {
    const user = userEvent.setup()
    at('/?tipo=capturas')
    await user.click(await screen.findByRole('button', { name: 'Ver Captura de control 1920×1080 a tamaño completo' }))
    await screen.findByRole('dialog', { name: 'Captura de control 1920×1080' })
    await user.keyboard('{ArrowRight}')
    expect(await screen.findByRole('dialog', { name: 'Captura UMG 1280×720' })).toBeInTheDocument()
    expect(screen.getByText('2 de 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByRole('dialog', { name: 'Captura de control 1920×1080' })).toBeInTheDocument()
  })
})
