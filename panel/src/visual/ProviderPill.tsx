import type { GlyphSpec } from './glyphs'

/** El nombre identifica al proveedor; el punto solo refuerza su tono. */
export function ProviderPill({ label, tone = 'neutral', size = 24 }: {
  label: string; tone?: GlyphSpec['tone']; size?: number
}) {
  return <span role="img" aria-label={label} title={label}
    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-subtle bg-card px-2 align-middle text-foreground whitespace-nowrap"
    style={{ minHeight: size, width: 'auto', fontSize: 11, fontFamily: 'var(--k-font-mono)' }}>
    <span data-provider-dot aria-hidden="true" className="size-1.5 rounded-full"
      style={{ backgroundColor: (tone === 'primary' ? 'var(--vbg-color-primary)' : `var(--k-${tone})`) }} />
    {label}
  </span>
}
