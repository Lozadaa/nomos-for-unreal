import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { DirectorDot, directorState } from './DirectorDot'
import { Tabs } from './Tabs'
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
    ['escuchando', 'Nomos escuchando', 'bg-success', true],
    ['vigilanteCaido', 'Vigilante caído', 'bg-warning', false],
    ['desconectado', 'Servicio desconectado', 'bg-error', false],
    ['esperando', 'Esperando a Nomos', 'bg-neutral', false],
    ['atendiendo', 'Nomos atendiendo', 'bg-info', false],
  ] as const)('%s muestra texto y color de estado', (state, text, color, pulses) => {
    render(<DirectorDot state={state} />)
    expect(screen.getByText(text)).toBeInTheDocument()
    const dot = screen.getByTestId('director-dot')
    expect(dot).toHaveClass(color)
    expect(dot.classList.contains('k-pulse')).toBe(pulses)
    expect(dot).toHaveAttribute('data-state', state)
  })
})

describe('Tabs', () => {
  const at = (path: string) => {
    const router = createMemoryRouter([{ path: '*', element: <Tabs /> }], { initialEntries: [path] })
    render(<RouterProvider router={router} />)
  }
  it('marca la pestaña activa por ruta', () => {
    at('/actividad')
    expect(screen.getByRole('link', { name: 'Actividad' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Producción' })).not.toHaveAttribute('aria-current')
  })
  it('Producción es la ruta raíz y no queda activa en otras rutas', () => {
    at('/')
    expect(screen.getByRole('link', { name: 'Producción' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('link')).toHaveLength(9)
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
    expect(await screen.findByPlaceholderText(/Busca/)).toBeInTheDocument()
    expect(screen.getByText('Presupuesto')).toBeInTheDocument()
    expect(screen.getByText('Habilidad Meteorito')).toBeInTheDocument()
    expect(screen.getByText('Nueva petición')).toBeInTheDocument()
  })
  it('Ctrl+K también abre', async () => {
    mount()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(await screen.findByPlaceholderText(/Busca/)).toBeInTheDocument()
  })
  it('no se abre si el foco está en un textarea', () => {
    mount(<textarea aria-label="mensaje" />)
    const area = screen.getByLabelText('mensaje')
    area.focus()
    fireEvent.keyDown(area, { key: 'k', metaKey: true })
    expect(screen.queryByPlaceholderText(/Busca/)).not.toBeInTheDocument()
  })
  it('Esc cierra y devuelve el foco al elemento que lo tenía', async () => {
    const onClose = vi.fn()
    mount(<button>antes</button>)
    const before = screen.getByText('antes')
    before.focus()
    fireEvent.keyDown(before, { key: 'k', metaKey: true })
    const input = await screen.findByPlaceholderText(/Busca/)
    fireEvent.keyDown(input, { key: 'Escape' })
    await vi.waitFor(() => expect(screen.queryByPlaceholderText(/Busca/)).not.toBeInTheDocument())
    expect(document.activeElement).toBe(before)
    expect(onClose).not.toHaveBeenCalled()
  })
  it('Pausar y Reanudar llaman a la acción; Indexar está habilitado', async () => {
    const toggle = vi.fn()
    mount(undefined, { paused: false, onTogglePause: toggle })
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(await screen.findByText('Indexar')).toHaveAttribute('aria-disabled', 'false')
    fireEvent.click(screen.getByText('Pausar'))
    expect(toggle).toHaveBeenCalledTimes(1)
  })
})
