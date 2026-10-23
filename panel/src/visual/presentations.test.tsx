import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Glyph, GlyphLegend } from './Glyph'
import { glyphFor, glyphs } from './glyphs'

it('reduce el registro y la leyenda a 30 iconos y siete proveedores', () => {
  expect(Object.keys(glyphs)).toEqual(['area', 'taskState', 'directorState', 'provider', 'artifact'])
  render(<GlyphLegend />)
  expect(screen.getAllByRole('listitem')).toHaveLength(37)
  for (const title of ['Roles', 'Eventos', 'Fuentes del catálogo']) expect(screen.queryByText(title)).toBeNull()
})

it('muestra roles como texto y fuentes como pastillas, incluidos valores nuevos', () => {
  const { container } = render(<><Glyph kind="role" value="implementacion" /><Glyph kind="source" value="polyhaven" /><Glyph kind="source" value="nueva fuente" /></>)
  expect(screen.getByText('Implementación')).toBeVisible()
  expect(screen.getAllByRole('img')).toHaveLength(2)
  expect(screen.getByRole('img', { name: 'Poly Haven' })).toHaveTextContent('Poly Haven')
  expect(screen.getByRole('img', { name: 'nueva fuente' })).toHaveTextContent('nueva fuente')
  expect(container.querySelector('svg')).toBeNull()
})

it('los eventos reutilizan su entidad y las ejecuciones identifican al proveedor', () => {
  expect(glyphFor('event', 'task.created').Icon).toBe(glyphFor('taskState', 'pendiente').Icon)
  expect(glyphFor('event', 'decision.created').Icon).toBe(glyphFor('taskState', 'decision').Icon)
  expect(glyphFor('event', 'review.started').Icon).toBe(glyphFor('taskState', 'revisando').Icon)
  render(<><Glyph kind="event" value="run.started" provider="claude" /><Glyph kind="event" value="message.created" /></>)
  expect(screen.getByRole('img', { name: 'Claude' })).toHaveTextContent('Claude')
  expect(screen.getByText('Mensaje')).toBeVisible()
})

it('un evento resuelto o detenido no anuncia un estado activo que no conoce', () => {
  expect(glyphFor('event', 'decision.resolved')).toMatchObject({ label: 'Decisión', tone: 'neutral' })
  expect(glyphFor('event', 'director.stopped')).toMatchObject({ label: 'Director', tone: 'neutral' })
  expect(glyphFor('event', 'review.completed')).toMatchObject({ label: 'Revisión', tone: 'neutral' })
})
