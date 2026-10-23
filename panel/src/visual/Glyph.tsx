import type { ComponentType, SVGProps } from 'react'
import { glyphFor, glyphs, type GlyphKind, type GlyphSpec } from './glyphs'

export function Glyph({ kind, value, size = 16, tone, showLabel = false }: {
  kind: GlyphKind; value: string; size?: number; tone?: GlyphSpec['tone']; showLabel?: boolean
}) {
  const spec = glyphFor(kind, value)
  const Icon = spec.Icon as ComponentType<SVGProps<SVGSVGElement> & { size?: number; title?: string }>
  return (
    <span title={spec.label} className="inline-flex shrink-0 items-center gap-2 align-middle" style={{ color: (tone ?? spec.tone) === 'primary' ? 'var(--vbg-color-primary)' : `var(--k-${tone ?? spec.tone})` }}>
      <Icon size={size} role="img" aria-label={spec.label} aria-hidden={undefined} title={spec.label} />
      {showLabel && <span className="text-[13px] text-foreground">{spec.label}</span>}
    </span>
  )
}

const kindLabels: Record<GlyphKind, string> = {
  area: 'Áreas', taskState: 'Estados de tarea', directorState: 'Estados del director', provider: 'Proveedores',
  role: 'Roles', event: 'Eventos', artifact: 'Artefactos', source: 'Fuentes del catálogo',
}

export function GlyphLegend() {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {(Object.keys(glyphs) as GlyphKind[]).map((kind) => (
        <div key={kind} data-testid={`legend-${kind}`}>
          <h3 className="mb-3 text-xs font-medium text-muted-foreground">{kindLabels[kind]}</h3>
          <ul className="grid gap-2">
            {Object.keys(glyphs[kind]).map((value) => <li key={value}><Glyph kind={kind} value={value} showLabel /></li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}
