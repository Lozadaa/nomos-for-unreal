import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'

vi.mock('@/api', () => ({ token: 'tok-secreto', api: vi.fn() }))
import { api } from '@/api'
import { resetStore } from '@/store'
import { Proyectos } from './Proyectos'

const projects = [
  { name: 'BlockKings', dir: 'C:/Unreal/Esquina', port: 51234, alive: true, current: false, liveTasks: 3, openDecisions: 1, hasCapture: true },
  { name: 'KratosFabTest', dir: 'C:/Unreal/KratosFabTest', port: 8780, alive: true, current: true, liveTasks: 0, openDecisions: 0, hasCapture: false },
  { name: 'Viejo', dir: 'C:/Unreal/Viejo', port: 9999, alive: false, current: false },
]
const show = () => render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <Proyectos /> }])} />)

beforeEach(() => { resetStore(); vi.mocked(api).mockReset(); vi.mocked(api).mockResolvedValue(projects) })
afterEach(cleanup)

describe('Portada de proyectos (hito 10)', () => {
  it('una tarjeta por juego con su última captura, tareas vivas y Decisiones; el otro se abre en su propio servicio', async () => {
    show()
    const block = (await screen.findByText('BlockKings')).closest('li')!
    expect(within(block).getByText('3 tareas vivas · 1 Decisión')).toBeInTheDocument()
    expect(within(block).getByRole('img', { name: 'Última captura de BlockKings' }).getAttribute('src')).toContain('/projects/51234/capture')
    expect(within(block).getByRole('link')).toHaveAttribute('href', 'http://127.0.0.1:51234/')
    const current = screen.getByText('KratosFabTest').closest('li')!
    expect(within(current).getByText(/este panel/)).toBeInTheDocument()
    expect(within(current).getByRole('link')).toHaveAttribute('href', '/')
    expect(within(screen.getByText('Viejo').closest('li')!).queryByRole('link')).toBeNull()
    // el token nunca en pantalla ni en los enlaces a otros proyectos (cada panel lo pide a su servicio)
    for (const link of screen.getAllByRole('link')) expect(link.getAttribute('href')).not.toContain('tok')
    expect(document.body.textContent).not.toContain('tok-secreto')
  })
})
