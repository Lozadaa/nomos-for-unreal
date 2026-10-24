import { render, screen, within } from '@testing-library/react'
import { CircleDashed } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { Glyph, GlyphLegend } from './Glyph'
import { glyphFor, glyphs, type GlyphKind } from './glyphs'

const expected = {
  area: ['gameplay', 'ui', 'escenarios', 'assets', 'animacion', 'audio', 'qa', 'builds'],
  taskState: ['pendiente', 'preparada', 'implementando', 'revisando', 'probando', 'integrando', 'cerrando', 'done', 'bloqueada', 'decision'],
  directorState: ['esperando', 'escuchando', 'atendiendo', 'vigilanteCaido', 'desconectado'],
  provider: ['codex', 'claude', 'opencode', 'meshy', 'blender', 'unreal', 'nomos', 'launcher'],
  artifact: ['model', 'texture', 'screenshot', 'video', 'build', 'report', 'diff'],
} satisfies Record<GlyphKind, string[]>

describe('registro de glifos', () => {
  it('cubre exactamente las cinco listas cerradas y nunca usa el desconocido', () => {
    expect(Object.keys(glyphs)).toEqual(Object.keys(expected))
    for (const [kind, values] of Object.entries(expected)) {
      expect(Object.keys(glyphs[kind as GlyphKind])).toEqual(values)
      for (const value of values) {
        const spec = glyphFor(kind as GlyphKind, value)
        expect(spec.Icon).not.toBe(CircleDashed)
        expect(spec.label.length).toBeGreaterThan(0)
        const { unmount } = render(<Glyph kind={kind as GlyphKind} value={value} />)
        expect(screen.getByRole('img', { name: spec.label })).toBeVisible()
        unmount()
      }
    }
  })

  it('desconocidos, incluso claves del prototipo, conservan su texto y tooltip', () => {
    for (const value of ['nuevo', 'constructor', '__proto__', '']) {
      expect(glyphFor('area', value)).toEqual({ Icon: CircleDashed, tone: 'neutral', label: value })
    }
    render(<Glyph kind="area" value="proveedor nuevo" />)
    expect(screen.getByRole('img', { name: 'proveedor nuevo' })).toHaveAttribute('title', 'proveedor nuevo')
  })

  it('resuelve eventos por prefijo y mantiene desconocidos los prefijos ajenos', () => {
    expect(glyphFor('event', 'task.created')).toEqual(glyphFor('event', 'task'))
    expect(glyphFor('event', 'taskforce.created').presentation).toBe('text')
  })

  it('respeta tamaño, tono y etiqueta visible opcional a 13 px', () => {
    const { container } = render(<Glyph kind="taskState" value="done" size={24} tone="warning" showLabel />)
    const icon = screen.getByRole('img', { name: 'Hecha' })
    expect(icon).toHaveAttribute('width', '24')
    expect(container.firstChild).toHaveStyle({ color: 'var(--k-warning)' })
    expect(screen.getByText('Hecha')).toHaveClass('text-[13px]')
  })

  it('el tono primario del director usa un token que existe', () => {
    const { container } = render(<Glyph kind="directorState" value="atendiendo" />)
    expect(container.firstChild).toHaveStyle({ color: 'var(--vbg-color-primary)' })
  })

  it('la leyenda agrupa las 38 entradas sin omitir ninguna', () => {
    render(<GlyphLegend />)
    expect(screen.getAllByRole('listitem')).toHaveLength(38)
    for (const [kind, values] of Object.entries(expected)) {
      const group = screen.getByTestId(`legend-${kind}`)
      expect(within(group).getAllByRole('img')).toHaveLength(values.length)
    }
  })
})
