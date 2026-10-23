/** Mensaje en español para un error del servicio o de la red: dice qué pasó y qué hacer, sin códigos internos. */
export function humanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(message)) return 'No hay conexión con el servicio. Comprueba que Kratos sigue en marcha.'
  if (message === 'unauthorized') return 'La sesión del panel caducó. Ábrelo de nuevo desde Kratos.'
  if (message === 'decision_stale') return 'La decisión cambió mientras la mirabas. Recárgala para ver la actual.'
  if (message.startsWith('invalid_') || message === 'unknown_option') return 'El servicio no aceptó los datos. Revísalos e inténtalo de nuevo.'
  if (message.startsWith('unknown_') || message === 'not_found') return 'Eso ya no existe en el servicio. Recarga la vista.'
  if (message === 'body_too_large') return 'El texto es demasiado largo. Acórtalo e inténtalo de nuevo.'
  if (/^http_5|internal_error/.test(message)) return 'El servicio falló. Inténtalo de nuevo en unos segundos.'
  return 'Algo falló. Inténtalo de nuevo.'
}
