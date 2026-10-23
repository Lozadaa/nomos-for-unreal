export const budgets = { produccionRow: 7, viewHeader: 4, catalogCard: 5, decisionCard: 20, directorBar: 4 } as const

/** Texto renderizado, incluidos bloques bajo el viewport. No cuenta atributos ni ayudas ocultas. */
export function visibleWords(root: HTMLElement): number {
  const count = (text: string) => (text.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu) ?? []).length
  function walk(node: Node): number {
    if (node.nodeType === Node.TEXT_NODE) return count(node.textContent ?? '')
    if (!(node instanceof Element)) return 0
    if (node.matches('[hidden], [inert], [aria-hidden="true"], .sr-only, script, style, option, svg title')) return 0
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return 0
    if (node instanceof HTMLSelectElement) return count([...node.selectedOptions].map((o) => o.text).join(' '))
    return [...node.childNodes].reduce((sum, child) => sum + walk(child), 0)
  }
  return walk(root)
}
