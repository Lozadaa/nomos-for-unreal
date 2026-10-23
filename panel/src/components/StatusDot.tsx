import { cn } from '@/lib/utils'
import type { Tone } from '@/lib/tasks'

const tone: Record<Tone, string> = {
  success: 'bg-success', warning: 'bg-warning', error: 'bg-error', info: 'bg-info', neutral: 'bg-neutral',
}

/** Punto de estado: el color acompaña siempre a un texto en la fila, nunca va solo. */
export function StatusDot({ tone: t, pulse = false, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return <span aria-hidden data-tone={t} className={cn('inline-block size-2 shrink-0 rounded-full transition-colors duration-(--k-dur-standard)', tone[t], pulse && 'k-pulse', className)} />
}
