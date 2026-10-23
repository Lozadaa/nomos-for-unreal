import { durations } from './motion'

export const supportsViewTransitions = (): boolean =>
  typeof (document as unknown as { startViewTransition?: unknown }).startViewTransition === 'function'

type Transition = { finished: Promise<void> }
type StartViewTransition = (update: () => void | Promise<void>) => Transition

let current: Transition | null = null

/** Cambia de vista con View Transitions; sin la API (Firefox hoy) aplica un fundido CSS equivalente. Siempre resuelve. */
export async function withViewTransition(update: () => void | Promise<void>): Promise<void> {
  const start = (document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition
  if (typeof start !== 'function') {
    const root = document.documentElement
    await update()
    root.classList.add('fallback-fade')
    setTimeout(() => root.classList.remove('fallback-fade'), durations.standard)
    return
  }
  const transition = start.call(document, update)
  current = transition
  try {
    await transition.finished
  } catch {
    // transición saltada o abortada: la actualización ya se aplicó
  } finally {
    if (current === transition) current = null
  }
}

/** Retrasa `fn` hasta que termine la transición en curso, para no animar dos veces ni saltar. */
export async function queueWhileTransitioning(fn: () => void | Promise<void>): Promise<void> {
  if (current) await current.finished.catch(() => undefined)
  await fn()
}

/** Anima un cambio de estructura de una lista con View Transitions (sin la API, lo aplica tal cual: nada de fundidos de página por cada evento). */
export async function animateUpdate(update: () => void): Promise<void> {
  if (!supportsViewTransitions()) return queueWhileTransitioning(update)
  await queueWhileTransitioning(() => withViewTransition(update))
}

export const nameFor = (entity: 'task' | 'row' | 'decision' | 'asset', id: string): string =>
  `${entity}-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
