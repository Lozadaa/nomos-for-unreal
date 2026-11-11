import { memo } from 'react'
import { memoSeed } from './seed'

type Counts = number | readonly number[]
const positive = (n: number) => Number.isFinite(n) ? Math.max(0, n) : 0

/** Listas paralelas para detalle por archivo; números para el resumen del diff. */
export const DiffBars = memo(function DiffBars({ added, removed, files }: { added: Counts; removed: Counts; files: number | readonly string[] }) {
  const rows = memoSeed('diff', JSON.stringify([added, removed, files]), () => {
    const adds = typeof added === 'number' ? [added] : added
    const subs = typeof removed === 'number' ? [removed] : removed
    const count = Math.max(adds.length, subs.length, typeof files === 'number' ? 1 : files.length)
    let max = 1
    for (const n of [...adds, ...subs]) max = Math.max(max, positive(n))
    return Array.from({ length: count }, (_, i) => ({
      a: positive(adds[i] ?? 0), r: positive(subs[i] ?? 0),
      aw: Math.round(positive(adds[i] ?? 0) / max * 70), rw: Math.round(positive(subs[i] ?? 0) / max * 70),
      label: typeof files === 'number' ? `${files} archivos` : files[i] ?? `Archivo ${i + 1}`,
    }))
  })
  // Se divide por archivo sin perder filas: cada bloque SVG conserva un presupuesto de 2 KB.
  const blocks = Array.from({ length: Math.max(1, Math.ceil(rows.length / 4)) }, (_, i) => rows.slice(i * 4, i * 4 + 4))
  return <div className="grid gap-1">
    {blocks.map((block, index) => <div key={index} title={block.map((row) => `${row.label} · +${row.a} / −${row.r}`).join('\n')}>
      <svg className="w-full" viewBox={`0 0 160 ${Math.max(16, block.length * 16)}`} role="img" aria-label={`Changes in ${typeof files === 'number' ? files : files.length} files`} stroke="var(--vbg-color-info)" fill="none" strokeWidth="3">
        {block.map((row, i) => <g key={i}>
          <title>{row.label.length > 32 ? `${row.label.slice(0, 31)}…` : row.label} · +{row.a} / −{row.r}</title>
          <path d={`M82 ${i * 16 + 8}h${row.aw}`} />
          <path d={`M78 ${i * 16 + 8}h-${row.rw}`} strokeDasharray="2 2" />
        </g>)}
      </svg>
    </div>)}
  </div>
})
