import { cn } from '@/lib/utils'

/** Cifra en mono que hace «tick» (300 ms) cada vez que cambia: al remontarse con `key`, la animación CSS vuelve a empezar. */
export function Tick({ value, className }: { value: string | number; className?: string }) {
  return (
    <span key={value} data-tick={value} className={cn('k-tick inline-block font-mono tabular-nums', className)}>
      {value}
    </span>
  )
}
