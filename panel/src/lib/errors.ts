import { BRAND } from '@/lib/brand'
/** Mensaje en español para un error del servicio o de la red: dice qué pasó y qué hacer, sin códigos internos. */
export function humanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(message)) return `Can't reach the service. Check that ${BRAND.short} is still running.`
  if (message === 'unauthorized') return `Your panel session expired. Open it again from ${BRAND.short}.`
  if (message === 'decision_stale') return 'This decision changed while you were looking. Reload to see the current one.'
  // hito 14: Jugar
  if (message === 'no_build') return 'No playable build yet. One arrives with the next wrap-up.'
  if (message === 'already_running') return 'The game is already running.'
  if (message === 'invalid_play_config') return 'Check "play" in config.json: the map must start with /Game/ and the arguments must be a list.'
  if (message.startsWith('invalid_') || message === 'unknown_option') return 'The service rejected that input. Check it and try again.'
  if (message.startsWith('unknown_') || message === 'not_found') return 'That no longer exists. Reload the view.'
  if (message === 'body_too_large') return 'That text is too long. Shorten it and try again.'
  if (/^http_5|internal_error/.test(message)) return 'The service hit an error. Try again in a few seconds.'
  return 'Something went wrong. Try again.'
}
