export interface DiffStatSummary { files: number; added: number; removed: number }

/** Git escala los signos de cada archivo; únicamente el resumen contiene totales. */
export function parseDiffStat(stat: string): DiffStatSummary | null {
  const totals: DiffStatSummary = { files: 0, added: 0, removed: 0 }
  let found = false
  for (const line of stat.split(/\r?\n/)) {
    const summary = /^\s*(\d+) files? changed(?:,\s+(\d+) insertions?\(\+\))?(?:,\s+(\d+) deletions?\(-\))?\s*$/.exec(line)
    if (!summary) {
      // Un resumen incompleto tampoco permite un agregado fiable con los demás.
      if (/^\s*\S+ files? changed(?:,|$)/.test(line)) return null
      continue
    }
    const [files, added, removed] = [Number(summary[1]), Number(summary[2] ?? 0), Number(summary[3] ?? 0)]
    if (![files, added, removed].every(Number.isSafeInteger)) return null
    totals.files += files
    totals.added += added
    totals.removed += removed
    if (!Object.values(totals).every(Number.isSafeInteger)) return null
    found = true
  }
  return found ? totals : null
}
