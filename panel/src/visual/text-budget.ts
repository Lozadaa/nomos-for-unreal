export const budgets = { produccionRow: 7, viewHeader: 4, catalogCard: 5, decisionCard: 20, directorBar: 4 } as const

const words = /[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu

export function countWords(text: string): number { return (text.match(words) ?? []).length }

/** Conserva el texto original si cabe; al abreviar corta tras una palabra completa. */
export function truncateWords(text: string, max: number): string {
  if (max === Infinity) return text
  if (!Number.isFinite(max) || max < 1) return ''
  const limit = Math.floor(max)
  const matches = [...text.matchAll(words)]
  if (matches.length <= limit) return text
  const last = matches[limit - 1]
  return `${text.slice(0, last.index + last[0].length).trimEnd()}…`
}

/** Texto renderizado, incluidos bloques bajo el viewport. No cuenta atributos ni ayudas ocultas. */
export function visibleWords(root: HTMLElement): number {
  function walk(node: Node): number {
    if (node.nodeType === Node.TEXT_NODE) return countWords(node.textContent ?? '')
    if (!(node instanceof Element)) return 0
    if (node.matches('[hidden], [inert], [aria-hidden="true"], .sr-only, script, style, option, svg title')) return 0
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return 0
    if (node instanceof HTMLSelectElement) return countWords([...node.selectedOptions].map((o) => o.text).join(' '))
    return [...node.childNodes].reduce((sum, child) => sum + walk(child), 0)
  }
  return walk(root)
}
