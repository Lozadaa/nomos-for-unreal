import { describe, expect, it } from 'vitest'
import { humanError } from './errors'

describe('humanError', () => {
  it.each([
    [new Error('invalid_task'), /rejected that input/],
    [new Error('http_500'), /The service hit an error/],
    [new Error('unauthorized'), /session expired/],
    [new TypeError('Failed to fetch'), /Can't reach the service/],
    [new Error('unknown_task'), /no longer exists/],
    [new Error('no_build'), /No playable build yet/],
    [new Error('already_running'), /already running/],
    [new Error('invalid_play_config'), /config\.json/],
    [new Error('algo raro'), /Something went wrong/],
  ])('%s → mensaje en español con salida', (e, expected) => expect(humanError(e)).toMatch(expected))
  it('nunca deja ver un código interno', () => expect(humanError(new Error('invalid_task'))).not.toMatch(/invalid_/))
})
