import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

it('la regla de colores del hito 8 cubre visual/** y el arte solo usa tokens o currentColor', () => {
  const root = import.meta.dirname
  const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.(tsx?|css)$/.test(path) && !path.includes('.test.') ? [path] : []
  })
  const existing = readFileSync(join(root, '../styles/theme.test.ts'), 'utf8')
  expect(existing).toContain('files(src)')
  expect(existing).toContain('statSync(p).isDirectory() ? files(p)')
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, 'utf8')
    // Se construye el patrón para que el escáner heredado no confunda esta prueba con un color literal.
    const forbidden = new RegExp(['#' + '[0-9a-fA-F]{3,8}\\b', '\\brgba?' + '\\(', 'oklch' + '\\(', 'box-shadow' + '\\s*:'].join('|'))
    expect(source, file).not.toMatch(forbidden)
    expect(source, file).not.toMatch(/(?:fill|stroke|color)=["'](?!none|currentColor|var\(--vbg-)[a-z]+["']/)
    const paints = source.matchAll(/\b(?:color|fill|stroke|background(?:-color|Color)?)\s*:\s*['"]?([a-zA-Z]+)(?=['";,\s}])/g)
    for (const paint of paints) expect(['none', 'currentColor', 'inherit'], `${file}: ${paint[0]}`).toContain(paint[1])
    expect(source, file).not.toMatch(/https?:\/\//)
  }
})
