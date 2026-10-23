import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TooltipProvider } from './ui/tooltip'
import { TaskRow } from './TaskRow'
import { rowReason, type Task } from '@/lib/tasks'
import { budgets, visibleWords } from '@/visual/text-budget'

const task = (over: Partial<Task> = {}): Task => ({
  id: 'seed-task-09', createdAt: '2026-10-23T10:00:00.000Z', updatedAt: '2026-10-23T10:00:00.000Z', title: 'Barra de vida', spec: '', acceptance: [],
  state: 'preparada', blockedReason: null, decisionId: null, area: 'ui', assigneeRole: null, assigneeProvider: 'claude', parentTaskId: null,
  dependsOn: [], worktreeId: null, budgetId: null, ...over,
})

describe('motivo corto en la fila (hito 7)', () => {
  it('traduce esperas y fallos a tres palabras como mucho; el fallo manda', () => {
    expect(rowReason(task({ waitReason: 'Esperando reserva: WBP_Vida.uasset (tarea t1)' }))).toBe('Esperando reserva')
    expect(rowReason(task({ waitReason: 'Editor de KratosFabTest: ocupado por qa · unreal' }))).toBe('Esperando reserva')
    expect(rowReason(task({ waitReason: 'Depende de Diseñar HUD (implementando)' }))).toBe('Depende de…')
    expect(rowReason(task({ waitReason: 'Director en pausa' }))).toBe('Director en pausa')
    expect(rowReason(task({ waitReason: 'Esperando reserva: x', failure: { kind: 'connection', text: 'Orca no está abierto · reintento cada 30 s', detail: null, at: '' } }))).toBe('Sin conexión')
    for (const kind of ['execution', 'cancel_requested', 'cancel_confirmed', 'capability_missing'] as const)
      expect(rowReason(task({ failure: { kind, text: '', detail: null, at: '' } }))!.split(' ').length).toBeLessThanOrEqual(3)
    expect(rowReason(task())).toBeNull()
  })

  it('la fila muestra el motivo sin pasar de siete palabras y el detalle completo va al tooltip', () => {
    render(<TooltipProvider><TaskRow task={task({ waitReason: 'Depende de Diseñar HUD (implementando)' })} now={Date.parse('2026-10-23T10:02:00Z')} open={false} onOpen={vi.fn()} /></TooltipProvider>)
    const row = screen.getByRole('button', { name: /Barra de vida/ })
    expect(within(row).getByText('Depende de…')).toBeInTheDocument()
    const clone = row.cloneNode(true) as HTMLElement
    clone.querySelectorAll('[data-task-title], [data-task-id-text]').forEach((el) => el.remove())
    expect(visibleWords(clone)).toBeLessThanOrEqual(budgets.produccionRow)
  })
})

describe('motivo y estado no se repiten', () => {
  it('una tarea bloqueada o con Decisión no repite el motivo en la fila', () => {
    expect(rowReason(task({ waitReason: 'Elegir personaje base: 3 candidatos', decisionId: 'd1' }))).toBeNull()
    expect(rowReason(task({ waitReason: 'Falta el pack', blockedReason: 'Falta el pack' }))).toBeNull()
    expect(rowReason(task({ waitReason: 'Codex apagado: dale cupo en config.json' }))).toBe('Codex apagado')
  })
})
