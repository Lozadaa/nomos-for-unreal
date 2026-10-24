import type { Locator } from '@playwright/test'

/**
 * Mismo contrato que visual/text-budget: tokens Unicode por nodo de texto, no atributos ni valores de input.
 * Cuenta todo el DOM renderizado (también debajo del viewport); excluye hidden, aria-hidden,
 * sr-only, display:none, visibility:hidden, scripts/styles, SVG title y opciones nativas cerradas.
 * Un select cerrado aporta solamente su opción seleccionada. Un tooltip aporta texto solo si está abierto.
 */
export async function visibleWords(scope: Locator): Promise<number> {
  return scope.evaluate((root) => {
    const tokens = (text: string) => text.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu)?.length ?? 0
    const excluded = (el: Element | null): boolean => {
      if (!el) return true
      for (let node: Element | null = el; node; node = node.parentElement) {
        if (node.matches('script,style,option,svg title,[hidden],[inert],[aria-hidden="true"],.sr-only')) return true
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return true
      }
      return false
    }
    let count = 0
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (!excluded(node.parentElement)) count += tokens(node.textContent ?? '')
    }
    for (const select of root.querySelectorAll('select')) {
      if (!excluded(select)) count += Array.from(select.selectedOptions).reduce((n, option) => n + tokens(option.textContent ?? ''), 0)
    }
    return count
  })
}
