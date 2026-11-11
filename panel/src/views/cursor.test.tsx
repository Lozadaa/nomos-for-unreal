import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Task } from '@/lib/tasks'

vi.mock('@/api', () => ({ token: null, ApiError: class extends Error { status = 0 }, api: vi.fn() }))
vi.mock('@google/model-viewer', () => ({}))
import { api } from '@/api'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Header } from '@/shell/Header'
import { refresh, resetStore } from '@/store'
import { Estilo } from './Estilo'
import { Inicio } from './Inicio'
import { Produccion } from './Produccion'

// La regla de theme.css: todo lo pulsable lleva cursor pointer (petición del usuario, 2026-11-11)
const css = readFileSync(join(import.meta.dirname, '../styles/theme.css'), 'utf8')
const pointer = css.match(/:where\(([^{]+)\)\s*\{\s*cursor:\s*pointer;/)![1]
const interactive = 'button, a[href], [role=button], [role=tab], [role=menuitem], [role=option], [role=switch], [role=checkbox], summary, select, input[type=checkbox], input[type=radio], input[type=range]'
const overrides = /\bcursor-(default|auto|text|none)\b|(^|\s)pointer-events-none(\s|$)/

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, createdAt: '2026-10-23T10:00:00.000Z', updatedAt: '2026-10-23T10:00:00.000Z', title: id, spec: '', acceptance: [], state: 'implementando',
  blockedReason: null, decisionId: null, area: 'gameplay', assigneeRole: null, assigneeProvider: null, parentTaskId: null, dependsOn: [],
  worktreeId: null, budgetId: null, ...over,
})

beforeEach(() => {
  resetStore()
  vi.mocked(api).mockReset()
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path === '/tasks') return [task('Salto'), task('HUD', { state: 'pendiente' }), task('Estatua', { state: 'done' })]
    if (path === '/approvals') return { pending: 0, items: [], general: [] }
    if (path.startsWith('/')) return []
    throw new Error(path)
  })
})
afterEach(cleanup)

function check(container: HTMLElement) {
  const elements = [...container.querySelectorAll<HTMLElement>(interactive)]
  expect(elements.length).toBeGreaterThan(0)
  for (const el of elements) {
    const name = `${el.tagName} ${el.getAttribute('aria-label') ?? el.textContent?.slice(0, 40)}`
    expect(el.matches(pointer), name).toBe(true)
    if (!el.matches(':disabled, [aria-disabled=true]')) expect(String(el.className), name).not.toMatch(overrides)
  }
}

describe('cursor pointer en todo lo pulsable', () => {
  it('la regla base cubre lo interactivo y lo deshabilitado lleva not-allowed', () => {
    expect(css).toMatch(/:where\(:disabled, \[aria-disabled=true\], \[data-disabled\]\) \{ cursor: not-allowed; \}/)
  })

  it.each([
    ['Inicio', <Inicio />],
    ['Producción', <Produccion />],
    ['Estilo', <Estilo />],
    ['Cabecera', <Header project="Trompo" status={null} onCommand={() => undefined} />],
  ])('%s', async (_, ui) => {
    const { container } = render(<TooltipProvider><RouterProvider router={createMemoryRouter([{ path: '/', element: ui }])} /></TooltipProvider>)
    await act(async () => { await refresh() })
    check(container)
  })
})
