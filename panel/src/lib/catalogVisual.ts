/** El catálogo puede almacenar paths locales; solo se usan URLs que ya sean servibles. */
export function catalogThumbnailUrl(path: string | null | undefined, origin = location.origin): string | null {
  if (!path?.trim()) return null
  const value = path.trim()
  if (/[\\\u0000-\u001f]/.test(value) || !(value.startsWith('/') && !value.startsWith('//') || /^https?:\/\//i.test(value))) return null
  try {
    const url = new URL(value, origin)
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== new URL(origin).origin || url.username || url.password) return null
    if (/^\/(?:Users|home|tmp|private|var|Volumes)(?:\/|$)/i.test(decodeURIComponent(url.pathname))) return null
    return value.startsWith('/') ? `${url.pathname}${url.search}${url.hash}` : url.href
  } catch { return null }
}

/** Recurso general cuando el catálogo no tiene una categoría equivalente a un área. */
export function catalogArea(category: string): string {
  const areas: Record<string, string> = {
    gameplay: 'gameplay', ui: 'ui', escenarios: 'escenarios', scene: 'escenarios', environment: 'escenarios', level: 'escenarios',
    animacion: 'animacion', animation: 'animacion', audio: 'audio', sound: 'audio', music: 'audio', qa: 'qa', builds: 'builds',
  }
  return Object.hasOwn(areas, category.toLowerCase()) ? areas[category.toLowerCase()] : 'assets'
}
