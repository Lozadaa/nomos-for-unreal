import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { glyphFor, glyphs } from './glyphs'

/** Compara formas renderizadas: también descubre dos componentes con el mismo dibujo. */
function shape(spec: (typeof glyphs.area)[keyof typeof glyphs.area]) {
  if (!spec.Icon) return null
  const Icon = spec.Icon
  return renderToStaticMarkup(<Icon />).replace(/ class="[^"]*"/g, '')
}

describe('iconos distinguibles en cinco segundos', () => {
  it('cada entrada tiene etiqueta, tono de token y significado documentado', () => {
    const guide = readFileSync(resolve(import.meta.dirname, '../../../docs/diseno/glifos.md'), 'utf8')
    for (const [kind, entries] of Object.entries(glyphs)) {
      for (const [value, entry] of Object.entries(entries)) {
        expect(entry.label.trim(), `${kind}/${value}`).not.toBe('')
        expect(['neutral', 'info', 'success', 'warning', 'error', 'primary']).toContain(entry.tone)
        expect(guide).toContain(`\`${kind}/${value}\``)
        expect(guide).toContain(entry.label)
      }
    }
  })

  it('no repite una forma dentro de ningún grupo', () => {
    for (const [kind, entries] of Object.entries(glyphs)) {
      const shapes = Object.values(entries).map(shape).filter((value) => value !== null)
      expect(new Set(shapes).size, kind).toBe(shapes.length)
    }
  })

  it('áreas, estados y artefactos que aparecen juntos no comparten formas', () => {
    const shapes = [glyphs.area, glyphs.taskState, glyphs.directorState, glyphs.artifact].flatMap((group) => Object.values(group).map(shape))
    expect(new Set(shapes).size).toBe(shapes.length)
  })

  it('las fuentes del catálogo no se confunden con áreas o artefactos', () => {
    const concepts = new Set([glyphs.area, glyphs.artifact].flatMap((group) => Object.values(group).map(shape)))
    for (const value of ['fab', 'megascans', 'polyhaven', 'ambientcg', 'kenney', 'quaternius', 'sketchfab', 'freesound', 'meshy', 'blender']) {
      const entry = glyphFor('source', value)
      expect(entry.presentation).toBe('pill')
      if (entry.Icon) expect(concepts.has(shape(entry)), entry.label).toBe(false)
    }
  })
})
