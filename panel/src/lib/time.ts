/** «hace 12 s», «hace 2 min», «hace 3 h», «hace 2 d». */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'nunca'
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 5) return 'ahora'
  if (s < 60) return `hace ${s} s`
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return `hace ${Math.floor(s / 86400)} d`
}
