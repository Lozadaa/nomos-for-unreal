import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
/** La tarjeta de un proyecto (su nombre puede salir también en el marcador, no capture). */
const card = (name: string) => screen.getAllByText(name)[0].closest('li')!
const show = () => render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <Proyectos /> }])} />)

beforeEach(() => { resetStore(); vi.mocked(api).mockReset(); vi.mocked(api).mockResolvedValue(projects) })
afterEach(cleanup)

describe('Portada de proyectos (hito 10)', () => {
  it('una tarjeta por juego con su última captura, live tasks y Decisiones; el otro se abre en su propio servicio', async () => {
    show()
    await screen.findAllByText('BlockKings')
    const block = card('BlockKings')
    expect(within(block).getByText('3 live tasks · 1 decision')).toBeInTheDocument()
    expect(within(block).getByRole('img', { name: 'Latest capture of BlockKings' }).getAttribute('src')).toContain('/projects/51234/capture')
    expect(within(block).getByRole('link')).toHaveAttribute('href', 'http://127.0.0.1:51234/')
    const current = card('KratosFabTest')
    expect(within(current).getByText(/this panel/)).toBeInTheDocument()
    expect(within(current).getByRole('link')).toHaveAttribute('href', '/')
    expect(within(card('Viejo')).queryByRole('link')).toBeNull()
    // el token nunca en pantalla ni en los enlaces a otros proyectos (cada panel lo pide a su servicio)
    for (const link of screen.getAllByRole('link')) expect(link.getAttribute('href')).not.toContain('tok')
    expect(document.body.textContent).not.toContain('tok-secreto')
  })

  it(', no capture o si la imagen falla, un marcador neutro con el nombre del proyecto; nunca una imagen rota', async () => {
    show()
    await screen.findAllByText('KratosFabTest')
    const current = card('KratosFabTest')
    expect(within(current).queryByRole('img', { name: /Última captura/ })).toBeNull()
    expect(within(current).getByRole('img', { name: 'KratosFabTest, no capture' })).toBeInTheDocument()
    const block = card('BlockKings')
    fireEvent.error(within(block).getByRole('img', { name: 'Latest capture of BlockKings' }))
    expect(within(block).queryByRole('img', { name: 'Latest capture of BlockKings' })).toBeNull()
    expect(within(block).getByRole('img', { name: 'BlockKings, no capture' })).toBeInTheDocument()
  })
})
