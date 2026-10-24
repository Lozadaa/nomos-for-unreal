import { describe, expect, it } from 'vitest'
import type { NomosEvent } from '@/lib/tasks'
import { directorState, typingActive } from './DirectorDot'

let seq = 0
const e = (type: string, messageId = 'm1') => ({ seq: ++seq, id: `e${seq}`, type, messageId, payload: {}, createdAt: '' }) as NomosEvent
const status = { service: true, listener: true, listenerAgeSec: 1, director: 's', lastAckSeq: 0, lastAckAt: null, pending: 0, paused: false } as never

describe('Punto del director · respondiendo (hito 10)', () => {
  it('mientras hay director.typing sin respuesta ni tiempo agotado, el punto dice «respondiendo»', () => {
    expect(typingActive([e('message.received'), e('director.typing')])).toBe(true)
    expect(typingActive([e('director.typing'), e('message.replied')])).toBe(false)
    expect(typingActive([e('director.typing'), e('director.typing_timeout')])).toBe(false)
    expect(typingActive([e('director.typing'), e('message.replied'), e('director.typing')])).toBe(true)
    expect(directorState(status, 'ok', true)).toBe('respondiendo')
    expect(directorState(status, 'ok', false)).toBe('escuchando')
    expect(directorState(null, 'ok', true)).toBe('desconectado')
  })
})
