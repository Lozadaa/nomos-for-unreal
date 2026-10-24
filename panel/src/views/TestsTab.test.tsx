import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Artifact, TaskDetail, TestRun } from '@/lib/tasks'

vi.mock('@/api', () => ({ api: vi.fn(), token: 't' }))
vi.mock('@/feel/toasts', () => ({ toasts: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { api } from '@/api'
import { visibleWords } from '@/visual/text-budget'
import { TestsTab } from './TestsTab'

const mockApi = vi.mocked(api)
const row = (id: string, checkId: string | null, result: TestRun['result'], extra: Partial<TestRun> = {}): TestRun => ({
  id, taskId: 't1', runId: 'r1', checkId, result, commit: 'abc1234def5678', engineVersion: '5.8.3', map: '/Game/Maps/Nivel1',
  config: '1280x720', reportPath: `C:/datos/artifacts/tests/${id}/log.txt`, createdAt: '2026-10-23T10:00:00.000Z', ...extra,
})
const artifact = (id: string, kind: string, testRunId: string, path: string): Artifact => ({
  id, taskId: 't1', kind, path, license: null, createdAt: '2026-10-23T10:00:00.000Z', provenance: { testRunId, check: 'map' },
})
const detail = (testRuns: TestRun[], artifacts: Artifact[] = []): TaskDetail => ({
  task: { id: 't1', title: 'HUD', state: 'probando', area: 'ui' } as TaskDetail['task'], runs: [], events: [], artifacts, testRuns, decision: null,
})

beforeEach(() => { mockApi.mockReset() })
afterEach(() => cleanup())

describe('TestsTab · tabla de pruebas con metadatos y evidencia', () => {
  it('una fila por prueba con comprobación, estado del registro, commit corto, motor y evidencia; ≤ 7 palabras visibles', () => {
    render(<TestsTab detail={detail([row('a', 'map', 'passed'), row('b', 'cpp', 'failed'), row('c', 'umg', 'running'), row('d', 'none', 'skipped', { engineVersion: null, commit: null })],
      [artifact('x1', 'report', 'a', 'C:/datos/artifacts/tests/a/log.txt'), artifact('x2', 'screenshot', 'a', 'C:/datos/artifacts/tests/a/map-1280x720.png')])} />)
    const table = screen.getByRole('table', { name: 'Pruebas' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['Mapa', 'C++', 'UMG', 'Sin Unreal'])
    expect(within(rows[0]).getByRole('img', { name: 'Superada' })).toHaveClass('lucide-check-circle-2')
    expect(within(rows[1]).getByRole('img', { name: 'Fallida' })).toHaveClass('lucide-ban')
    expect(within(rows[2]).getByRole('img', { name: 'En curso' })).toHaveClass('lucide-test-tube-2')
    expect(within(rows[3]).getByText('Omitida')).toBeInTheDocument()
    expect(within(rows[0]).getByText('abc1234')).toBeInTheDocument()
    expect(within(rows[0]).getByText('5.8.3')).toBeInTheDocument()
    const links = within(rows[0]).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual(['Mapa · registro', 'Captura de control']) // hito 7: sin nombres de archivo
    expect(links[0].getAttribute('href')).toMatch(/^\/artifacts\/x1\/file\?token=/)
    for (const r of rows) expect(visibleWords(r)).toBeLessThanOrEqual(7)
    expect(within(rows[0]).getByRole('button', { name: /Detalle/ }).getAttribute('aria-label')).toMatch(/^Detalle: mapa \/Game\/Maps\/Nivel1 · config 1280x720 · \d\d\/10 \d\d:00$/)
  })

  it('no disponible: texto corto y la Decisión en línea cuando la hay', () => {
    render(<TestsTab detail={detail([row('a', 'cpp', 'unavailable')])} decisionCard={<section aria-label="Decisión pendiente">Continuar</section>} />)
    expect(screen.getByText('No disponible')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Decisión pendiente' })).toBeInTheDocument()
  })

  it('«Lanzar pruebas» encola checks.run de la tarea y muestra el envío', async () => {
    let release!: (v: unknown) => void
    mockApi.mockImplementation(() => new Promise((r) => { release = r }))
    render(<TestsTab detail={detail([])} />)
    const user = userEvent.setup()
    const button = screen.getByRole('button', { name: 'Lanzar pruebas' })
    await user.click(button)
    expect(mockApi).toHaveBeenCalledWith('/tasks/t1/checks', { method: 'POST', body: {} })
    expect(button).toHaveAttribute('aria-busy', 'true')
    release({ commandId: 'c1', state: 'pending' })
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'false'))
    expect(screen.getByText(/Esta tarea aún no tiene pruebas/)).toBeInTheDocument()
  })
})
