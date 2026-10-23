import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ArtGallery } from './ArtGallery'

it('expone todas las semillas de producción y permite filtrar/mover en el mapa de muestra', () => {
  render(<ArtGallery />)
  const avatars = screen.getByLabelText('Avatares de las doce tareas de ejemplo')
  expect(avatars.querySelectorAll('figure')).toHaveLength(12)
  for (let i = 1; i <= 12; i++) expect(within(avatars).getByTitle(`seed-task-${String(i).padStart(2, '0')}`)).toBeInTheDocument()
  expect(screen.getByLabelText('Avatares de las ejecuciones y semillas próximas').querySelectorAll('[role="img"]')).toHaveLength(5)
  expect(screen.getByLabelText('Estados vacíos por vista').querySelectorAll('figure')).toHaveLength(8)
  fireEvent.click(screen.getByRole('button', { name: 'Implementando: 2' }))
  expect(screen.getByText('05 · 06')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Mover tarea 05' }))
  expect(screen.getByRole('button', { name: 'Implementando: 1' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Revisando: 3' })).toBeInTheDocument()
})

it('la galería no muestra patrones decorativos ni series de actividad inventadas', () => {
  const { container } = render(<ArtGallery />)
  expect(screen.queryByRole('img', { name: 'Actividad por hora' })).toBeNull()
  expect(container.querySelector('svg[aria-hidden="true"]')).toBeNull()
})
