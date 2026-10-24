/** Prueba 15: un 401 deja el panel sin sesión; sin token nunca la hubo, con token es de un arranque anterior del servicio. */
export type Session = 'ok' | 'sinToken' | 'caducada'
let session: Session = 'ok'
const listeners = new Set<() => void>()
export const sessionState = () => session
export function onSession(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener) } }
export function markSession(hadToken: boolean): void {
  const next = hadToken ? 'caducada' : 'sinToken'
  if (session === next) return
  session = next
  for (const listener of listeners) listener()
}
