import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@google/model-viewer', () => ({}))
vi.mock('@/hooks/artifact', () => ({ useArtifactSrc: (id: string) => `/artifacts/${id}/file?token=fixture-token` }))
import { GlbViewer } from './GlbViewer'

afterEach(cleanup)

describe('visor3D', () => {
  it('carga el modelo autorizado sin giro automático y permite controlar la cámara', async () => {
    render(<GlbViewer id="modelo" name="Estatua.glb" />)
    const viewer = await screen.findByRole('img', { name: 'Modelo 3D de Estatua.glb' })
    expect(viewer.tagName).toBe('MODEL-VIEWER')
    expect(viewer).toHaveAttribute('src', '/artifacts/modelo/file?token=fixture-token')
    expect(viewer).toHaveAttribute('camera-controls')
    expect(viewer).not.toHaveAttribute('auto-rotate')
  })
})
