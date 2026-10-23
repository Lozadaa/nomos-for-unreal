import { Skeleton } from '@/components/ui/skeleton'

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Cargando la producción" className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-4 border-b border-subtle px-4">
          <Skeleton className="size-2 rounded-full" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="ml-auto h-3 w-24" />
        </div>
      ))}
    </div>
  )
}

export function SheetSkeleton() {
  return (
    <div role="status" aria-label="Cargando el detalle de la tarea" className="flex flex-col gap-3 p-6">
      <span className="text-sm text-muted-foreground">Cargando el detalle de la tarea</span>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}
