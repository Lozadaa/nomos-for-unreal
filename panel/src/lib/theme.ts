import { useSyncExternalStore } from 'react'

/** Claro (crema) u oscuro (tinta): sigue a prefers-color-scheme salvo que el conmutador de la cabecera haya elegido. */
export type Mode = 'claro' | 'oscuro'
const KEY = 'nomos.tema'
const listeners = new Set<() => void>()
const media = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null)
const chosen = (): Mode | null => { try { const v = localStorage.getItem(KEY); return v === 'claro' || v === 'oscuro' ? v : null } catch { return null } }
export const currentMode = (): Mode => chosen() ?? (media()?.matches ? 'oscuro' : 'claro')

function apply() {
  const mode = currentMode(), root = document.documentElement
  root.classList.toggle('dark', mode === 'oscuro')
  // la barra del navegador toma el fondo del token, no un valor escrito a mano
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.append(meta) }
  meta.content = getComputedStyle(root).getPropertyValue('--vbg-surface-primary').trim()
  listeners.forEach((l) => l())
}

export function startTheme() {
  apply()
  media()?.addEventListener('change', apply)
}

export function setMode(mode: Mode) {
  try { localStorage.setItem(KEY, mode) } catch { /* sin almacenamiento: dura esta visita */ }
  document.documentElement.classList.toggle('dark', mode === 'oscuro')
  apply()
}

export const useMode = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, currentMode, () => 'claro' as Mode)
