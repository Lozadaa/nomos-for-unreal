import { BRAND } from '@/lib/brand'
/** Mensaje en español para un error del servicio o de la red: dice qué pasó y qué hacer, sin códigos internos. */
export function humanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(message)) return `No hay conexión con el servicio. Comprueba que ${BRAND.short} sigue en marcha.`
  if (message === 'unauthorized') return `La sesión del panel caducó. Ábrelo de nuevo desde ${BRAND.short}.`
  if (message === 'decision_stale') return 'La decisión cambió mientras la mirabas. Recárgala para ver la actual.'
  // hito 14: Jugar
  if (message === 'no_build') return 'Todavía no hay ninguna build para jugar. Llegará con el próximo cierre.'
  if (message === 'already_running') return 'El juego ya está abierto.'
  if (message === 'invalid_play_config') return 'Revisa «play» en config.json: el mapa empieza por /Game/ y los argumentos son una lista.'
  if (message.startsWith('invalid_') || message === 'unknown_option') return 'El servicio no aceptó los datos. Revísalos e inténtalo de nuevo.'
  if (message.startsWith('unknown_') || message === 'not_found') return 'Eso ya no existe en el servicio. Recarga la vista.'
  if (message === 'body_too_large') return 'El texto es demasiado largo. Acórtalo e inténtalo de nuevo.'
  if (/^http_5|internal_error/.test(message)) return 'El servicio falló. Inténtalo de nuevo en unos segundos.'
  return 'Algo falló. Inténtalo de nuevo.'
}
