import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { api } from '@/api'
import { CommandMenu } from './CommandMenu'

vi.mock('@/api', () => ({ token: 'tok', ApiError: class extends Error {}, api: vi.fn(async () => ({ commandId: 'c1', state: 'pending' })) }))

const mount = (url = '/', tasks = [{ id: 'abc1234', title: 'Habilidad Meteorito', state: 'probando' }]) => {
  const router = createMemoryRouter([{ path: '*', element: <><CommandMenu tasks={tasks} /><input aria-label="Título" /><textarea aria-label="Descripción" /></> }], { initialEntries: [url] })
  render(<RouterProvider router={router} />)
}

describe('CommandMenu (hito 7)', () => {
  it('Ctrl+K no abre la paleta con el foco en un input ni en un textarea (Review Focus 5)', () => {
    mount()
    for (const name of ['Título', 'Descripción']) {
      const field = screen.getByLabelText(name)
      field.focus()
      fireEvent.keyDown(field, { key: 'k', ctrlKey: true })
      expect(screen.queryByRole('dialog')).toBeNull()
    }
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('con una tarea abierta ofrece sus acciones según la etapa y «Lanzar pruebas» llama al servicio', async () => {
    mount('/?tarea=abc1234')
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    expect(screen.getByText('Open task: Habilidad Meteorito')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Merge' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('option', { name: 'Wrap up' })).toHaveAttribute('aria-disabled', 'true')
    await userEvent.setup().click(screen.getByRole('option', { name: 'Run checks' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/tasks/abc1234/checks', { method: 'POST', body: {} }))
  })

  it('sin tarea abierta no muestra acciones de tarea', () => {
    mount('/')
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    expect(screen.queryByText(/Tarea abierta/)).toBeNull()
    expect(screen.getByRole('option', { name: 'New request' })).toBeInTheDocument()
  })
})
