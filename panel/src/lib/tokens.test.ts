import { expect, it } from 'vitest'
import { millions, tokensLine } from './tasks'

it('tokens en millones con una decimal y línea por run', () => {
  expect(millions(1_284_000)).toBe('1,3 M')
  expect(millions(3835)).toBe('0,0 M')
  expect(tokensLine({ amount: 1_284_000, note: JSON.stringify({ turns: 42, model: 'claude-opus-4-8' }) })).toBe('Tokens: 1,3 M · 42 turnos · opus')
  expect(tokensLine({ amount: 0, note: 'sin transcripción' })).toBe('Tokens: 0,0 M · sin transcripción')
})
