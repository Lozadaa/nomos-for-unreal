import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ArtGallery } from './ArtGallery'

it('expone todas las semillas de producción y permite filtrar/mover en el mapa de muestra', () => {
  render(<ArtGallery />)
  const avatars = screen.getByLabelText('Agents from sample runs')
  expect(avatars.querySelectorAll('figure')).toHaveLength(0)
  expect(within(avatars).getAllByRole('img')).toHaveLength(3)
  expect(screen.queryByLabelText('Avatares de las doce tareas de ejemplo')).toBeNull()
  expect(screen.getByLabelText('Avatar states').querySelectorAll('[data-state]')).toHaveLength(3)
  expect(screen.getByLabelText('Empty states by view').querySelectorAll('figure')).toHaveLength(8)
  fireEvent.click(screen.getByRole('button', { name: 'Building: 2' }))
  expect(screen.getByText('05 · 06')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Move task 05' }))
  expect(screen.getByRole('button', { name: 'Building: 1' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reviewing: 3' })).toBeInTheDocument()
})

it('la galería no muestra patrones decorativos ni series de actividad inventadas', () => {
  const { container } = render(<ArtGallery />)
  expect(screen.queryByRole('img', { name: 'Actividad por hora' })).toBeNull()
  expect(container.querySelector('svg[aria-hidden="true"]')).toBeNull()
})
