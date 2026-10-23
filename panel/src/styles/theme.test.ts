import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = join(import.meta.dirname, '..')
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(n) ? [p] : []
  })
const prohibido = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|oklch\(|box-shadow\s*:/

describe('tokens', () => {
  it('ningún archivo de panel/src salvo theme.css lleva colores o sombras a mano', () => {
    const malos = files(src)
      .filter((f) => !f.endsWith('theme.css') && !f.endsWith('theme.test.ts'))
      .filter((f) => prohibido.test(readFileSync(f, 'utf8')))
    expect(malos).toEqual([])
  })
  it('theme.css mapea shadcn a los tokens vbg y fuerza color-scheme oscuro', () => {
    const css = readFileSync(join(src, 'styles/theme.css'), 'utf8')
    for (const l of ['color-scheme: dark;', '--background: var(--vbg-surface-primary);', '--card: var(--vbg-surface-secondary);',
      '--foreground: var(--vbg-text-primary);', '--muted-foreground: var(--vbg-text-secondary);', '--border: var(--vbg-border-default);',
      '--ring: var(--vbg-focus);', '--radius: var(--vbg-radius);', '--k-font-mono:']) expect(css).toContain(l)
    expect(css).not.toMatch(/box-shadow/)
  })
})
