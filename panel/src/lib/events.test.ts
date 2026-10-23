import { describe, expect, it } from 'vitest'
import type { KratosEvent } from './tasks'
import { eventPresentation, eventProvider, hourlyActivity, laneOf, placeEvents } from './events'

const event = (type: string, payload: Record<string, unknown> = {}, at = '2026-10-23T10:30:00Z'): KratosEvent => ({ seq: 1, id: 'e1', type, payload, createdAt: at, messageId: null })

describe('Fuente y glifo de los eventos', () => {
  it('usa el estado declarado del evento de tarea y conserva la entidad neutral si falta', () => {
    expect(eventPresentation(event('task.moved', { state: 'revisando' }))).toEqual({ kind: 'taskState', value: 'revisando' })
    expect(eventPresentation(event('task.moved', { to: 'probando' }))).toEqual({ kind: 'taskState', value: 'probando' })
    expect(eventPresentation(event('task.blocked', { state: 'implementando' }))).toEqual({ kind: 'taskState', value: 'bloqueada' })
    expect(eventPresentation(event('task.activity'))).toEqual({ kind: 'event', value: 'task.activity' })
  })

  it('resuelve el proveedor desde el evento o su ejecución, sin usar un responsable de tarea', () => {
    const providers = new Map([['r1', 'opencode']])
    expect(eventProvider(event('run.finished', { runId: 'r1' }), providers)).toBe('opencode')
    expect(laneOf(event('worker.output', { runId: 'r1' }), providers)).toBe('OpenCode')
    expect(eventPresentation(event('run.finished', { runId: 'r1' }), providers)).toEqual({ kind: 'provider', value: 'opencode' })
    expect(eventProvider(event('task.activity', { source: 'Claude Code' }))).toBe('claude')
    expect(laneOf(event('run.finished', { provider: 'meshy' }))).toBe('Meshy')
    expect(laneOf(event('task.activity', { source: 'builds' }))).toBe('Compilaciones')
    expect(eventProvider(event('run.finished', { taskId: 't1' }))).toBeUndefined()
    expect(eventPresentation(event('run.finished', { taskId: 't1' }))).toEqual({ kind: 'event', value: 'run.finished' })
    expect(laneOf(event('task.activity'))).toBe('Kratos')
  })

  it('mantiene los mensajes, respuestas y descargas como texto corto del registro', () => {
    for (const type of ['message.received', 'reply.published', 'download.finished']) {
      expect(eventPresentation(event(type, { provider: 'codex' }))).toEqual({ kind: 'event', value: type })
    }
  })
})

describe('Actividad por hora de la ventana recibida', () => {
  it('agrega 24 intervalos reales por carril y descarta lo anterior al rango', () => {
    const events = [
      event('task.activity', { source: 'Codex' }, '2026-10-23T10:20:00Z'),
      event('task.activity', { source: 'Codex' }, '2026-10-23T10:55:00Z'),
      event('worker.output', { runId: 'r1' }, '2026-10-23T09:30:00Z'),
      event('task.activity', {}, '2026-10-22T10:59:00Z'),
      event('task.activity', {}, 'invalid'),
    ]
    const result = hourlyActivity(events, new Map([['r1', 'opencode']]))
    expect(result.start).toBe(Date.parse('2026-10-22T11:00:00Z'))
    expect(result.end).toBe(Date.parse('2026-10-23T11:00:00Z'))
    expect(result.lanes).toHaveLength(8)
    expect(result.lanes.every((lane) => lane.values.length === 24)).toBe(true)
    expect(result.lanes.find((lane) => lane.label === 'Codex')!.values.at(-1)).toBe(2)
    expect(result.lanes.find((lane) => lane.label === 'OpenCode')!.values.at(-2)).toBe(1)
    expect(result.lanes.flatMap((lane) => lane.values).reduce((a, b) => a + b, 0)).toBe(3)
  })
})

describe('Distribución de eventos cercanos', () => {
  it('reparte por espacio libre en tres niveles aunque el orden de llegada no sea cronológico', () => {
    const placed = placeEvents([50, 0, 51, 1, 52, 2])
    expect(placed.map((item) => item.track)).toEqual([0, 0, 1, 1, 2, 2])
    expect(placed.every((item) => !item.compact)).toBe(true)
  })

  it('compacta el grupo denso completo y recupera las etiquetas cuando hay espacio', () => {
    const placed = placeEvents([0, 0, 0, 0, 12])
    expect(placed.slice(0, 4).every((item) => item.compact)).toBe(true)
    expect(placed[4]).toEqual({ track: 0, compact: false })
  })
})
