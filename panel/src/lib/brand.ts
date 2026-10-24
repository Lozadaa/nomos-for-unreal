/** Nombre del producto en todo el panel (hito 11): «Nomos for Unreal» en la pestaña y la portada, «Nomos» en el resto. */
export const BRAND = { short: 'Nomos', long: 'Nomos for Unreal' } as const

/** Proveedor del propio servicio antes del hito 11 (Kratos): los eventos viejos lo traen así. Retirar a partir del 2026-11-24. */
export const legacyProvider = (provider: string) => (provider === 'kratos' ? 'nomos' : provider)
