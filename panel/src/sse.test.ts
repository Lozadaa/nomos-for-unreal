import { describe, expect, it } from 'vitest'
import { parseBlock } from './sse'

describe('parseBlock', () => {
  it('lee el evento de un bloque SSE de cualquier tipo, también los de hitos futuros', () => {
    const event = { seq: 7, id: 'e7', type: 'worker.output', messageId: null, payload: { text: 'hola' }, createdAt: '2026-10-23T10:00:00.000Z' }
    expect(parseBlock(`id: 7\nevent: worker.output\ndata: ${JSON.stringify(event)}`)).toEqual(event)
  })
  it('ignora comentarios y bloques rotos sin lanzar', () => {
    expect(parseBlock(': latido')).toBeNull()
    expect(parseBlock('id: 3\ndata: {no es json')).toBeNull()
  })
})
