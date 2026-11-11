import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

vi.mock('@/api', () => ({ token: 'tok', api: vi.fn() }))
import { api } from '@/api'
import { ProjectSwitcher } from './ProjectSwitcher'

const two = [
  { name: 'KratosFabTest', dir: 'C:/u/KratosFabTest', port: 8780, alive: true, current: true },
  { name: 'BlockKings', dir: 'C:/u/Esquina', port: 51234, alive: true, current: false },
]
const show = () => render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <ProjectSwitcher /> }, { path: '/proyectos', element: <p>portada</p> }])} />)

beforeEach(() => { vi.mocked(api).mockReset(); sessionStorage.clear() })
afterEach(cleanup)

describe('Selector de proyectos en la cabecera (hito 10)', () => {
  it('con más de un proyecto: los demás juegos abren su panel y «Todos los proyectos» la portada', async () => {
    vi.mocked(api).mockResolvedValue(two)
    sessionStorage.setItem('nomos.portada', '1')
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Switch project' }))
    expect(await screen.findByRole('menuitem', { name: 'BlockKings' })).toHaveAttribute('href', 'http://127.0.0.1:51234/')
    expect(screen.getByRole('menuitem', { name: 'All projects' })).toBeInTheDocument()
  })
  it('la primera vez de la sesión con varios proyectos, el panel abre la portada; después ya no', async () => {
    vi.mocked(api).mockResolvedValue(two)
    show()
    expect(await screen.findByText('portada')).toBeInTheDocument()
    cleanup()
    show()
    expect(await screen.findByRole('button', { name: 'Switch project' })).toBeInTheDocument()
  })
  it('con un solo proyecto no hay selector', async () => {
    vi.mocked(api).mockResolvedValue([two[0]])
    show()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('button', { name: 'Switch project' })).toBeNull()
  })
})
