import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { DirectorDot, directorState } from './DirectorDot'
import { MoreMenu, views } from './MoreMenu'
import { CommandMenu } from './CommandMenu'

const status = (over = {}) => ({ service: true, listener: false, listenerAgeSec: null, director: null, lastAckSeq: 0, lastAckAt: null, pending: 0, paused: false, ...over })

describe('DirectorDot', () => {
  it('deriva el estado del /status', () => {
    expect(directorState(null)).toBe('desconectado')
    expect(directorState(status())).toBe('esperando')
    expect(directorState(status({ listener: true, director: 's1' }))).toBe('escuchando')
    expect(directorState(status({ listener: true, director: 's1', pending: 2 }))).toBe('atendiendo')
    expect(directorState(status({ listener: false, director: 's1' }))).toBe('vigilanteCaido')
    // prueba 15: un 401 no es «desconectado»
    expect(directorState(null, 'sinToken')).toBe('sinToken')
    expect(directorState(status({ listener: true, director: 's1' }), 'caducada')).toBe('caducada')
  })

  it.each([
    ['escuchando', 'Nomos listening', 'bg-success', true],
    ['vigilanteCaido', 'Watcher down', 'bg-warning', false],
    ['desconectado', 'Service disconnected', 'bg-error', false],
    ['esperando', 'Waiting for Nomos', 'bg-neutral', false],
    ['atendiendo', 'Nomos working', 'bg-info', false],
  ] as const)('%s muestra texto y color de estado', (state, text, color, pulses) => {
    render(<DirectorDot state={state} />)
    expect(screen.getByText(text)).toBeInTheDocument()
    const dot = screen.getByTestId('director-dot')
    expect(dot).toHaveClass(color)
    expect(dot.classList.contains('k-pulse')).toBe(pulses)
    expect(dot).toHaveAttribute('data-state', state)
  })
})

describe('MoreMenu', () => {
  it('sin pestañas: «Más» abre el panel lateral con el resto de vistas y la pausa', async () => {
    const toggle = vi.fn()
    const router = createMemoryRouter([{ path: '*', element: <MoreMenu paused={false} onTogglePause={toggle} /> }], { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    expect(screen.queryByRole('link', { name: /All tasks/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const nav = await screen.findByRole('navigation', { name: 'Views' })
    expect(nav.querySelectorAll('a')).toHaveLength(views.length - 1)
    expect(screen.getByRole('link', { name: /All tasks/ })).toHaveAttribute('href', '/produccion')
    fireEvent.click(screen.getByRole('button', { name: 'Pause work' }))
    expect(toggle).toHaveBeenCalledTimes(1)
  })
})

describe('CommandMenu', () => {
  const mount = (children?: React.ReactNode, props: React.ComponentProps<typeof CommandMenu> = {}) => {
    const router = createMemoryRouter([{ path: '*', element: <><CommandMenu tasks={[{ id: 'abc1234', title: 'Habilidad Meteorito' }]} {...props} />{children}</> }])
    render(<RouterProvider router={router} />)
  }
  it('⌘K abre el menú con vistas, tareas y acciones', async () => {
    mount()
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(await screen.findByPlaceholderText(/Find/)).toBeInTheDocument()
    expect(screen.getByText('Budget')).toBeInTheDocument()
    expect(screen.getByText('Habilidad Meteorito')).toBeInTheDocument()
    expect(screen.getByText('New request')).toBeInTheDocument()
  })
  it('Ctrl+K también abre', async () => {
    mount()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(await screen.findByPlaceholderText(/Find/)).toBeInTheDocument()
  })
  it('no se abre si el foco está en un textarea', () => {
    mount(<textarea aria-label="mensaje" />)
    const area = screen.getByLabelText('mensaje')
    area.focus()
    fireEvent.keyDown(area, { key: 'k', metaKey: true })
    expect(screen.queryByPlaceholderText(/Find/)).not.toBeInTheDocument()
  })
  it('Esc cierra y devuelve el foco al elemento que lo tenía', async () => {
    const onClose = vi.fn()
    mount(<button>antes</button>)
    const before = screen.getByText('antes')
    before.focus()
    fireEvent.keyDown(before, { key: 'k', metaKey: true })
    const input = await screen.findByPlaceholderText(/Find/)
    fireEvent.keyDown(input, { key: 'Escape' })
    await vi.waitFor(() => expect(screen.queryByPlaceholderText(/Find/)).not.toBeInTheDocument())
    expect(document.activeElement).toBe(before)
    expect(onClose).not.toHaveBeenCalled()
  })
  it('Pausar y Reanudar llaman a la acción; Indexar está habilitado', async () => {
    const toggle = vi.fn()
    mount(undefined, { paused: false, onTogglePause: toggle })
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(await screen.findByText('Index catalog')).toHaveAttribute('aria-disabled', 'false')
    fireEvent.click(screen.getByText('Pause'))
    expect(toggle).toHaveBeenCalledTimes(1)
  })
})
