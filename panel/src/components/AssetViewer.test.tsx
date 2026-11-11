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
    await user.click(await screen.findByRole('button', { name: 'View UMG screenshot 1280×720 full size' }))
    const dialog = await screen.findByRole('dialog', { name: 'UMG screenshot 1280×720' })
    const img = within(dialog).getByRole('img', { name: 'UMG screenshot 1280×720' })
    expect(img.className).toContain('object-contain')
    expect(img.className).not.toContain('object-cover')
    expect(within(dialog).getByRole('heading').textContent).not.toMatch(/Highres|\.png|[0-9a-f]{8}-/)
    expect(dialog.textContent).not.toMatch(/Highres|\.png|C:\//) // hito 10: ni archivos ni rutas en pantalla
    expect(within(dialog).getByRole('link', { name: 'Open original' })).toHaveAttribute('href', expect.stringContaining('token=tok'))
  })

  it('Esc cierra el visor y el foco vuelve a la miniatura que lo abrió', async () => {
    const user = userEvent.setup()
    at('/')
    const thumb = await screen.findByRole('button', { name: 'View UMG screenshot 1280×720 full size' })
    await user.click(thumb)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(thumb).toHaveFocus())
  })

  it('→ pasa al siguiente del listado tal como está filtrado y ordenado', async () => {
    const user = userEvent.setup()
    at('/?tipo=capturas')
    await user.click(await screen.findByRole('button', { name: 'View Map check screenshot 1920×1080 full size' }))
    await screen.findByRole('dialog', { name: 'Map check screenshot 1920×1080' })
    await user.keyboard('{ArrowRight}')
    expect(await screen.findByRole('dialog', { name: 'UMG screenshot 1280×720' })).toBeInTheDocument()
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('dialog', { name: 'Map check screenshot 1920×1080' })).toBeInTheDocument()
  })
})

describe('Vídeo de animación (hito 5b, corrección 2)', () => {
  const video = a('9', 'video', 'C:/k/tests/x/anim-1280x720.mp4', { label: 'Animación · vídeo 1280×720 · AM_ComboAttack', resolution: '1280x720' })

  it('la tarjeta muestra el fotograma del 50 % con el glifo de vídeo y el visor lo reproduce en bucle, sin sonido y con controles', async () => {
    vi.mocked(api).mockResolvedValue([{ ...video, previewPath: 'C:/k/tests/x/anim-1280x720-50.png' }])
    const user = userEvent.setup()
    at('/')
    const thumb = await screen.findByRole('button', { name: 'View Animación · vídeo 1280×720 · AM_ComboAttack full size' })
    const still = within(thumb).getByRole('img', { name: 'Animación · vídeo 1280×720 · AM_ComboAttack' })
    expect(still.getAttribute('src')).toContain('/artifacts/9/preview')
    expect(within(thumb).getByRole('img', { name: 'Video' })).toBeInTheDocument()
    await user.click(thumb)
    const dialog = await screen.findByRole('dialog', { name: 'Animación · vídeo 1280×720 · AM_ComboAttack' })
    const player = dialog.querySelector('video')!
    expect(player).not.toBeNull()
    expect(player.getAttribute('src')).toContain('/artifacts/9/file')
    for (const attr of ['controls', 'autoplay', 'loop', 'playsinline']) expect(player.hasAttribute(attr), attr).toBe(true)
    expect(player.muted).toBe(true)
    expect(player.getAttribute('aria-label')).toBe('Animación · vídeo 1280×720 · AM_ComboAttack')
  })

  it('sin miniatura, la tarjeta del vídeo es su glifo; el filtro Vídeos la incluye', async () => {
    vi.mocked(api).mockResolvedValue([video])
    at('/?tipo=videos')
    const thumb = await screen.findByRole('button', { name: /^View Animación · vídeo/ })
    expect(within(thumb).queryByRole('img', { name: /AM_ComboAttack/ })).toBeNull()
    expect(within(thumb).getByRole('img', { name: 'Video' })).toBeInTheDocument()
  })
})
