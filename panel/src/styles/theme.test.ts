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
      // única sombra del panel: el brillo de «Jugar» (hito 14, petición literal del usuario), solo en play.css y con tokens
      .filter((f) => prohibido.test(readFileSync(f, 'utf8').replace(f.endsWith('play.css') ? /box-shadow:[^;]*;/g : /$^/, '')))
    expect(malos).toEqual([])
  })
  it('play.css solo estiliza .k-play', () => {
    const css = readFileSync(join(src, 'styles/play.css'), 'utf8')
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '').match(/^[^\s@}{][^{]*\{/gm)!.every((rule) => rule.includes('.k-play'))).toBe(true)
  })
  it('theme.css mapea shadcn a los tokens vbg: claro crema por defecto y oscuro cálido con .dark', () => {
    const css = readFileSync(join(src, 'styles/theme.css'), 'utf8')
    for (const l of ['color-scheme: light;', 'color-scheme: dark;', '.dark {', '--k-paper: #F5F0E8;', '--k-ink: #1F1E1D;', '--k-clay: #C96442;', '--k-clay-light: #E49A7B;', '--background: var(--vbg-surface-primary);', '--card: var(--vbg-surface-secondary);',
      '--foreground: var(--vbg-text-primary);', '--muted-foreground: var(--vbg-text-secondary);', '--border: var(--vbg-border-default);',
      '--ring: var(--vbg-focus);', '--radius: var(--vbg-radius);', '--k-font-mono:']) expect(css).toContain(l)
    expect(css).not.toMatch(/box-shadow/)
  })
})

describe('ancho (hito 10)', () => {
  it('el contenido ocupa todo el ancho y solo el texto corrido tiene máximo', () => {
    const css = readFileSync(join(src, 'styles/theme.css'), 'utf8')
    expect(css).toContain('--k-content: 100%;')
    expect(css).toContain('--k-prose: 72ch;')
    const layout = readFileSync(join(src, 'shell/Layout.tsx'), 'utf8')
    expect(layout).toMatch(/<main[^>]*px-4[^>]*sm:px-6/)
    for (const view of ['Chat', 'Decisiones', 'Estilo']) expect(readFileSync(join(src, `views/${view}.tsx`), 'utf8')).toContain('--k-prose')
  })
})
