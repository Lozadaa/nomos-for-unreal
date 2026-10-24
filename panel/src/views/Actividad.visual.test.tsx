import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { NomosEvent } from '@/lib/tasks'

vi.mock('@/api', () => ({ api: vi.fn(async () => []), token: null, ApiError: class extends Error {} }))
vi.mock('@/hooks/useRuns', () => ({ useRuns: () => [{ id: 'r-oc', provider: 'opencode' }] }))
import { ingest, resetStore } from '@/store'
import { Actividad } from './Actividad'

let seq = 0
const event = (type: string, payload: Record<string, unknown> = {}, createdAt = '2026-10-23T10:30:00Z'): NomosEvent => ({ seq: ++seq, id: `e${seq}`, type, payload, createdAt, messageId: null })
const mount = () => render(<MemoryRouter><Actividad /></MemoryRouter>)

beforeEach(() => { resetStore(); seq = 0 })

describe('Actividad visual', () => {
  it('presenta el estado de tarea y la ejecución por su proveedor, y conserva texto corto para mensajes', () => {
    act(() => {
      ingest(event('task.moved', { state: 'revisando' }))
      ingest(event('run.finished', { runId: 'r-oc', state: 'done' }))
      ingest(event('message.received'))
    })
    mount()
    const timeline = screen.getByRole('region', { name: 'Actividad por carriles' })
    expect(within(timeline).getByRole('img', { name: 'Revisando' })).toBeInTheDocument()
    expect(within(timeline).queryByRole('img', { name: 'Pendiente' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'OpenCode' })).getByRole('img', { name: 'OpenCode' })).toBeInTheDocument()
    expect(within(timeline).getByText('Mensaje', { selector: 'span' })).toBeInTheDocument()
    const chart = screen.getByRole('region', { name: 'Actividad por hora' })
    expect(within(chart).getAllByRole('img')).toHaveLength(8)
    for (const lane of ['Nomos', 'Codex', 'Claude Code', 'OpenCode', 'Meshy', 'Blender', 'Unreal', 'Compilaciones']) expect(within(chart).getByText(lane, { selector: 'li' })).toBeInTheDocument()
    expect(chart).toHaveTextContent('24 h')
  })

  it('conserva los 500 puntos de Nomos y declara el límite de la ventana recibida', () => {
    act(() => { for (let i = 0; i < 500; i++) ingest(event('task.activity', {}, '2026-10-23T10:30:00Z')) })
    mount()
    const lane = screen.getByRole('group', { name: 'Nomos' })
    const first = within(lane).getAllByRole('button', { pressed: false })[1]
    expect(within(lane).getAllByRole('button', { pressed: false })).toHaveLength(500)
    // un racimo compacto se ve como un recuento, no como 500 puntos
    expect(lane.querySelectorAll('[data-dense-marker]')).toHaveLength(0)
    expect([...lane.querySelectorAll('[data-cluster-count]')].map((n) => n.textContent)).toEqual(['×500'])
    const chart = screen.getByRole('region', { name: 'Actividad por hora' })
    expect(chart).toHaveTextContent('500 eventos')
    expect(within(chart).getByText('500 eventos')).toHaveAttribute('title', expect.stringContaining('puede faltar actividad anterior'))
    expect(chart).not.toHaveTextContent('puede faltar actividad anterior')
    act(() => { ingest(event('task.activity', {}, '2026-10-23T10:30:10Z')) })
    expect(within(lane).getAllByRole('button', { pressed: false })).toHaveLength(500)
    expect(first.isConnected).toBe(true)
  })

  it('separa las tres etiquetas cercanas de mensaje y respuesta en niveles distintos', () => {
    act(() => {
      ingest(event('message.received'))
      ingest(event('message.acked'))
      ingest(event('reply.published'))
    })
    mount()
    const lane = screen.getByRole('group', { name: 'Nomos' })
    const points = within(lane).getAllByRole('button', { pressed: false })
    expect(points.map((point) => point.getAttribute('data-track'))).toEqual(['0', '1', '2'])
    expect(lane.querySelectorAll('[data-dense-marker]')).toHaveLength(0)
    expect(screen.getByRole('region', { name: 'Actividad por hora' })).toHaveTextContent('3 eventos')
  })

  it('dibuja un eje de horas con una marca por hora y etiqueta cada tres horas', () => {
    act(() => {
      ingest(event('task.activity', {}, new Date(2026, 9, 23, 10, 5).toISOString()))
      ingest(event('task.activity', {}, new Date(2026, 9, 23, 17, 25).toISOString()))
    })
    mount()
    const axisRow = document.querySelector('[data-hour-axis]')!
    expect(axisRow.querySelectorAll('[data-hour-tick]')).toHaveLength(8) // 10:00 a 17:00
    expect([...axisRow.querySelectorAll('[data-hour-tick] > span')].map((n) => n.textContent)).toEqual(['12:00', '15:00'])
  })
})
