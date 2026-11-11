import { Mark } from '@/shell/Mark'
import { cn } from '@/lib/utils'

/** El caso raro: el proyecto todavía no tiene ni una captura. La marca v2 (símbolo y barra diagonal), nunca un icono gris centrado. */
export function NoCapture({ className, label = 'No capture yet' }: { className?: string; label?: string }) {
  return <span role="img" aria-label={label} className={cn('relative flex size-full flex-col items-start justify-end gap-1.5 overflow-hidden bg-card p-3 text-muted-foreground', className)}>
    <span aria-hidden className="absolute -top-3 right-6 h-[140%] w-3 skew-x-[-18deg] bg-foreground/6" />
    <span aria-hidden className="absolute -top-3 right-12 h-[140%] w-1 skew-x-[-18deg] bg-foreground/6" />
    <Mark size={28} />
    <span className="k-label">{label}</span>
  </span>
}
