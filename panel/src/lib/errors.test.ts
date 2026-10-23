import { describe, expect, it } from 'vitest'
import { humanError } from './errors'

describe('humanError', () => {
  it.each([
    [new Error('invalid_task'), /no aceptó los datos/],
    [new Error('http_500'), /El servicio falló/],
    [new Error('unauthorized'), /sesión del panel caducó/],
    [new TypeError('Failed to fetch'), /No hay conexión/],
    [new Error('unknown_task'), /ya no existe/],
    [new Error('algo raro'), /Algo falló/],
  ])('%s → mensaje en español con salida', (e, expected) => expect(humanError(e)).toMatch(expected))
  it('nunca deja ver un código interno', () => expect(humanError(new Error('invalid_task'))).not.toMatch(/invalid_/))
})
