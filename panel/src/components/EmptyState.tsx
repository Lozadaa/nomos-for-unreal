import { Button } from '@/components/ui/button'

/** Estado vacío: dice por qué está vacío y ofrece una acción (regla de docs/diseno/estados.md). */
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <h2 className="text-base font-medium">{title}</h2>
      {hint && <p className="max-w-md text-sm text-muted-foreground">{hint}</p>}
      {action && <Button variant="outline" size="sm" onClick={action.onClick}>{action.label}</Button>}
    </div>
  )
}
