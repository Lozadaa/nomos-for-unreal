import { act, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { AgentAvatar } from './AgentAvatar'
import { AreaPictogram } from './AreaPictogram'
import { EmptyState } from './EmptyState'
import { ViewHeader } from './ViewHeader'
import { catalog, type ArtView } from './catalog'
import { glyphFor, glyphs } from '../glyphs'

const views: ArtView[] = ['produccion', 'actividad', 'entregas', 'catalogo', 'chat', 'decisiones', 'presupuesto', 'capacidades']
const paths = (markup: string) => Array.from(markup.matchAll(/ d="([^"]*)"/g), (match) => match[1])
const markup = (element: ReactElement) => renderToStaticMarkup(element)

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('generadores de arte', () => {
  it('distingue ids casi iguales mediante tres formas geométricas a 24 px', () => {
    const first = markup(<AgentAvatar id="codex-1" provider="codex" />)
    expect(first).toBe(markup(<AgentAvatar id="codex-1" provider="codex" />))
    expect(paths(first)).not.toEqual(paths(markup(<AgentAvatar id="codex-2" provider="codex" />)))
    const { container } = render(<AgentAvatar id="codex-1" provider="codex" />)
    expect(screen.getByRole('img', { name: /codex-1.*Codex/ })).toHaveAttribute('width', '24')
    for (const shape of ['triangle', 'arc', 'bar']) expect(container.querySelector(`[data-shape="${shape}"]`)).toBeInTheDocument()
    expect(container.querySelector('[data-provider="codex"]')).toBeInTheDocument()
  })

  it('preserva el glifo de cada área a 48 px y admite áreas desconocidas', () => {
    for (const area of Object.keys(glyphs.area)) {
      const { container, unmount } = render(<AreaPictogram area={area} />)
      expect(screen.getByRole('img', { name: glyphFor('area', area).label })).toHaveAttribute('width', '48')
      expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '1.5')
      unmount()
    }
    render(<AreaPictogram area="nueva área" />)
    expect(screen.getByRole('img', { name: 'nueva área' })).toBeInTheDocument()
  })

  it('tiene ilustraciones y patrones distintos y estables para las ocho vistas', () => {
    expect(Object.keys(catalog)).toEqual(views)
    const emptyPaths = [], headerPaths = []
    for (const view of views) {
      const empty = markup(<EmptyState view={view} />), header = markup(<ViewHeader view={view} />)
      expect(empty).toBe(markup(<EmptyState view={view} />))
      expect(header).toBe(markup(<ViewHeader view={view} />))
      expect(empty).toContain('viewBox="0 0 160 120"')
      expect(header).toContain('viewBox="0 0 1400 40"')
      emptyPaths.push(paths(empty).join('|')); headerPaths.push(paths(header).join('|'))
    }
    expect(new Set(emptyPaths).size).toBe(8)
    expect(new Set(headerPaths).size).toBe(8)
  })

  it('mantiene cada SVG por debajo de 2048 bytes incluso con todas las semillas de producción', () => {
    const examples: ReactElement[] = []
    for (let n = 1; n <= 12; n++) examples.push(<AgentAvatar id={`seed-task-${String(n).padStart(2, '0')}`} provider={n === 6 ? 'meshy' : n === 7 ? 'claude' : 'codex'} />)
    for (const area of Object.keys(glyphs.area)) examples.push(<AreaPictogram area={area} />)
    for (const view of views) examples.push(<EmptyState view={view} />, <ViewHeader view={view} />)
    for (const example of examples) {
      const svg = markup(example)
      expect(Buffer.byteLength(svg, 'utf8')).toBeLessThanOrEqual(2048)
      expect(svg).toContain('<svg')
      expect(svg).not.toMatch(/(?:href|src)="https?:/)
    }
  })

  it('solo realza la cabecera al cambiar de vista y termina a los 180 ms', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const { container, rerender } = render(<ViewHeader view="produccion" />)
    const svg = () => container.querySelector('svg')!
    expect(svg()).toHaveStyle({ opacity: '0.08' })
    rerender(<ViewHeader view="actividad" />)
    expect(svg()).toHaveStyle({ opacity: '0.14' })
    act(() => vi.advanceTimersByTime(179))
    expect(svg()).toHaveStyle({ opacity: '0.14' })
    act(() => vi.advanceTimersByTime(1))
    expect(svg()).toHaveStyle({ opacity: '0.08' })
  })

  it('con movimiento reducido conserva la cabecera estática', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    const { container, rerender } = render(<ViewHeader view="produccion" />)
    rerender(<ViewHeader view="actividad" />)
    expect(container.querySelector('svg')).toHaveStyle({ opacity: '0.08' })
    expect(container.querySelector('svg')).not.toHaveStyle({ transition: 'opacity var(--k-dur-standard) var(--k-ease)' })
  })
})
