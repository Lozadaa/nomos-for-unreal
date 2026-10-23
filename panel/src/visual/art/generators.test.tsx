import { fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AreaPictogram } from './AreaPictogram'
import { EmptyState } from './EmptyState'
import { catalog, type ArtView } from './catalog'
import { Glyph } from '../Glyph'
import { glyphFor, glyphs } from '../glyphs'

const views: ArtView[] = ['produccion', 'actividad', 'entregas', 'catalogo', 'chat', 'decisiones', 'presupuesto', 'capacidades']

describe('arte con significado', () => {
  it('amplía a 48 px la misma forma del glifo de área, también para áreas nuevas', () => {
    for (const area of [...Object.keys(glyphs.area), 'nueva área']) {
      const { container, unmount } = render(<><AreaPictogram area={area} /><Glyph kind="area" value={area} /></>)
      const icons = screen.getAllByRole('img', { name: glyphFor('area', area).label })
      expect(icons[0]).toHaveAttribute('width', '48')
      expect(icons[0]).toHaveAttribute('stroke-width', '1.5')
      const svgs = container.querySelectorAll('svg')
      expect(svgs[0].innerHTML).toBe(svgs[1].innerHTML)
      expect(Buffer.byteLength(renderToStaticMarkup(<AreaPictogram area={area} />), 'utf8')).toBeLessThanOrEqual(2048)
      unmount()
    }
  })

  it('cada vacío ofrece un icono de 48 px, exactamente una frase y una acción útil', () => {
    expect(Object.keys(catalog)).toEqual(views)
    for (const view of views) {
      const { container, unmount } = render(<EmptyState view={view} />)
      expect(screen.getByRole('img', { name: `${catalog[view].label} sin elementos` })).toHaveAttribute('width', '48')
      expect(container.querySelectorAll('p')).toHaveLength(1)
      const action = screen.getByRole('link')
      expect(action.getAttribute('href')).toMatch(/^\/(?:\?nueva=1|chat)?$/)
      if (view === 'chat') expect(action).toHaveAttribute('href', '/?nueva=1')
      expect(container.querySelectorAll('path')).not.toHaveLength(0)
      expect(container.querySelector('svg')).toHaveClass('lucide')
      expect(Buffer.byteLength(container.querySelector('svg')!.outerHTML, 'utf8')).toBeLessThanOrEqual(2048)
      unmount()
    }
  })

  it('permite una acción de la vista sin duplicar el enlace predeterminado', () => {
    const click = vi.fn()
    render(<EmptyState view="catalogo" action={{ label: 'Indexar assets', onClick: click }} />)
    expect(screen.queryByRole('link')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Indexar assets' }))
    expect(click).toHaveBeenCalledOnce()
  })
})
