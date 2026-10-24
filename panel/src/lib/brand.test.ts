import { describe, expect, it } from 'vitest'
import { BRAND } from './brand'
import html from '../../index.html?raw'

const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!./brand.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const code = (text: string) => text.split('\n').filter((line) => !/^\s*(\/\/|\/\*\*|\*)/.test(line))

describe('marca única', () => {
  it('Nomos for Unreal en la pestaña; Nomos corto', () => {
    expect(BRAND).toEqual({ short: 'Nomos', long: 'Nomos for Unreal' })
    expect(html).toContain(`<title>${BRAND.long}</title>`)
  })
  it('ningún texto del panel contiene Kratos y el nombre sale solo de BRAND', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50)
    for (const [file, text] of Object.entries(sources)) {
      expect(text, file).not.toMatch(/kratos/i)
      expect(code(text).filter((line) => /\bNomos\b/.test(line)), file).toEqual([])
    }
  })
})
