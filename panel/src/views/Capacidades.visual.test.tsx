import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { KratosEvent, Run, Task } from '@/lib/tasks'

vi.mock('@/api', () => ({ api: vi.fn() }))
vi.mock('@/feel/toasts', () => ({ toasts: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { api } from '@/api'
import { ingest, refresh, resetStore } from '@/store'
import { Capacidades } from './Capacidades'

const mockApi = vi.mocked(api)
let seq = 0
const event = (type: string, payload: Record<string, unknown>): KratosEvent => ({ seq: ++seq, id: `e-${seq}`, type, messageId: null, payload, createdAt: '2026-10-23T10:00:00.000Z' })
const task = (id: string, area: Task['area'] = 'ui'): Task => ({
  id, area, title: id, state: 'implementando', blockedReason: null, decisionId: null,
  createdAt: '', updatedAt: '', spec: '', acceptance: [], assigneeRole: 'implementacion', assigneeProvider: 'codex',
  parentTaskId: null, dependsOn: [], worktreeId: null, budgetId: null,
})
const run = (id: string, provider: string, taskId: string, state: Run['state'] = 'running'): Run => ({
  id, provider, taskId, state, role: 'implementacion', startedAt: `2026-10-23T10:00:0${id.slice(-1)}.000Z`, finishedAt: null, summary: null,
})
const cap = (id: string, state: string, label = id) => ({ id, state, label, detail: `${label} detectado` })

beforeEach(() => { resetStore(); seq = 0; mockApi.mockReset() })
afterEach(() => { cleanup(); resetStore() })

describe('Capacidades · datos visuales comprobables', () => {
  it('muestra grupos de runs verificados y nombres globales, sin crear agentes a partir de conectores', async () => {
    const runs = [run('r1', 'codex', 't1'), run('r2', 'opencode', 't2'), run('r3', 'codex', 't3', 'done')]
    mockApi.mockImplementation((async (path: string) => {
      if (path === '/tasks') return [task('t1'), task('t2'), task('t3', 'audio')]
      if (path === '/capabilities') return [cap('meshy', 'detectado', 'Meshy')]
      const value = runs.find((r) => path === `/runs/${r.id}`)
      if (!value) throw new Error('unknown_run')
      return { run: value, latestStatus: { waiting: value.id === 'r2' } }
    }) as typeof api)
    await refresh()
    act(() => { for (const value of runs) ingest(event('run.started', { runId: value.id })) })
    const { container } = render(<Capacidades />)
    const agents = await screen.findByRole('region', { name: 'Agentes' })
    expect(await within(agents).findByText('UI Worker 2')).toHaveAttribute('title', 'OpenCode')
    expect(within(agents).getByText('UI Worker')).toHaveAttribute('title', 'Codex')
    expect(within(agents).getByText('Audio Worker')).toBeInTheDocument()
    const first = within(agents).getByRole('img', { name: 'UI Worker · Codex' })
    const second = within(agents).getByRole('img', { name: 'UI Worker 2 · OpenCode' })
    expect(first.querySelector('.k-agent-ordinal')).toHaveTextContent('1')
    expect(second.querySelector('.k-agent-ordinal')).toHaveTextContent('2')
    expect(second).toHaveAttribute('data-state', 'waiting')
    expect(within(agents).getByRole('img', { name: 'Audio Worker · Codex' })).toHaveAttribute('data-state', 'idle')
    expect(first.style.getPropertyValue('--agent-size')).toBe('48px')
    expect(within(agents).getByText('2 Codex · 1 activo')).toBeInTheDocument()
    expect(within(agents).getByText('1 OpenCode · 1 activo')).toBeInTheDocument()
    expect(container.querySelector('.k-agent-avatar[data-provider="meshy"]')).toBeNull()
  })

  it('espera respuesta solo en el run que coincide con store.waiting y elimina el anillo al terminar', async () => {
    let finished = false
    mockApi.mockImplementation((async (path: string) => {
      if (path === '/tasks') return [task('t1')]
      if (path === '/capabilities') return []
      const id = path.split('/').at(-1)!
      return { run: run(id, 'codex', 't1', finished && id === 'r2' ? 'done' : 'running'), latestStatus: { waiting: false } }
    }) as typeof api)
    await refresh()
    act(() => { ingest(event('run.started', { runId: 'r1' })); ingest(event('run.started', { runId: 'r2' })) })
    render(<Capacidades />)
    await screen.findByRole('img', { name: 'UI Worker 2 · Codex' })
    act(() => { ingest(event('worker.waiting', { runId: 'r2', taskId: 't1', question: '¿Continúo?' })) })
    expect(screen.getByRole('img', { name: 'UI Worker · Codex' })).toHaveAttribute('data-state', 'running')
    expect(screen.getByRole('img', { name: 'UI Worker 2 · Codex' })).toHaveAttribute('data-state', 'waiting')
    finished = true
    act(() => { ingest(event('run.finished', { runId: 'r2', taskId: 't1' })) })
    await waitFor(() => expect(document.querySelector('.k-agent-avatar[data-state="idle"]')).not.toBeNull())
    expect(screen.getAllByRole('img', { name: 'UI Worker · Codex' })).toHaveLength(2)
    expect(document.querySelector('.k-agent-ordinal')).toBeNull()
  })

  it('usa pastilla solo con proveedor conocido y glifos existentes con el nombre del estado de capacidad', async () => {
    const list0 = [
      cap('blender', 'ausente', 'Blender'), cap('unreal_mcp', 'detectado', 'Unreal MCP'),
      cap('meshy', 'comprobado', 'Meshy'), cap('git', 'roto', 'Git'), cap('fab_plugin', 'detectado', 'Fab'),
    ]
    mockApi.mockImplementation((async (path: string) => path === '/editors' ? [] : list0) as typeof api)
    render(<Capacidades />)
    const list = await screen.findByRole('list', { name: 'Capacidades' })
    expect(await within(list).findByRole('img', { name: 'No instalado' })).toHaveClass('lucide-circle')
    expect(within(list).getAllByRole('img', { name: 'Detectado · sin comprobar' })).toHaveLength(2)
    expect(within(list).getByRole('img', { name: 'Comprobado' })).toHaveClass('lucide-check-circle-2')
    expect(within(list).getByRole('img', { name: 'No responde' })).toHaveClass('lucide-wifi-off')
    expect(within(list).getByRole('img', { name: 'Unreal' })).toHaveTextContent('Unreal')
    expect(within(list).getByRole('img', { name: 'Meshy' })).toHaveTextContent('Meshy')
    expect(within(list).queryByRole('img', { name: 'Git' })).toBeNull()
    expect(within(list).queryByRole('img', { name: 'Fab' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Agentes' })).toBeNull()
  })

  it('Orca cerrado ofrece «Abrir Orca», que llama a su comprobación (orca open en el servicio)', async () => {
    const orca = { ...cap('orca', 'roto', 'Orca'), detail: 'Orca no está abierto', action: { id: 'open', label: 'Abrir Orca' } }
    mockApi.mockImplementation((async (path: string) => path === '/editors' ? [] : path === '/capabilities/orca/check' ? { ...orca, state: 'comprobado', action: undefined } : [orca]) as typeof api)
    render(<Capacidades />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Abrir Orca' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/capabilities/orca/check', { method: 'POST' }))
    expect(await screen.findByRole('button', { name: 'Volver a comprobar' })).toBeInTheDocument()
  })

  it('mantiene la ayuda y comprueba de verdad por POST: muestra Comprobado con fecha y devuelve el foco al botón', async () => {
    const caps = [cap('blender', 'ausente', 'Blender'), cap('git', 'detectado', 'Git')]
    const checked = { ...cap('git', 'comprobado', 'Git'), detail: 'git version 2.50', checkedAt: new Date().toISOString() }
    mockApi.mockImplementation((async (path: string) => path === '/editors' ? [] : path === '/capabilities/git/check' ? checked : caps) as typeof api)
    render(<Capacidades />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Ver cómo instalar' }))
    expect(screen.getByText(/Instálalo y pulsa/)).toBeInTheDocument()
    const check = screen.getByRole('button', { name: 'Comprobar ahora' })
    await user.click(check)
    expect(check).toHaveAttribute('aria-busy', 'true')
    await waitFor(() => expect(check).toHaveAttribute('aria-busy', 'false'))
    expect(check).toHaveFocus()
    expect(mockApi).toHaveBeenCalledWith('/capabilities/git/check', { method: 'POST' })
    expect(check).toHaveTextContent('Volver a comprobar')
    expect(screen.getByRole('img', { name: 'Comprobado' })).toBeInTheDocument()
    expect(screen.getByText(/Comprobado · revisado/)).toBeInTheDocument()
  })

  it('muestra el editor por proyecto: libre, y ocupado por el agente con su avatar', async () => {
    let busy = false
    mockApi.mockImplementation((async (path: string) => {
      if (path === '/tasks') return [task('t1')]
      if (path === '/capabilities') return []
      if (path === '/editors') return [{ project: 'KratosFabTest', busy: busy ? { runId: 'r1', taskId: 't1', since: '2026-10-23T10:00:00.000Z', agent: 'qa · claude', provider: 'claude', role: 'qa' } : null }]
      return { run: { ...run('r1', 'claude', 't1'), role: 'qa' }, latestStatus: { waiting: false } }
    }) as typeof api)
    await refresh()
    act(() => { ingest(event('run.started', { runId: 'r1' })) })
    render(<Capacidades />)
    const editor = await screen.findByRole('region', { name: 'Editor de Unreal' })
    expect(within(editor).getByText('KratosFabTest')).toBeInTheDocument()
    expect(within(editor).getByText('Libre')).toBeInTheDocument()
    busy = true
    act(() => { ingest(event('editor.busy', { project: 'KratosFabTest', runId: 'r1', taskId: 't1' })) })
    expect(await within(editor).findByText('Ocupado por UI Tester')).toBeInTheDocument()
    expect(within(editor).getByRole('img', { name: /^UI Tester · Claude/ })).toHaveAttribute('data-state', 'running')
  })
})
