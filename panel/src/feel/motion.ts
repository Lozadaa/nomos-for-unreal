export const durations = { micro: 120, standard: 180, panel: 220, reorder: 260 } as const

export const easing = 'cubic-bezier(.2,.8,.2,1)'

export const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
