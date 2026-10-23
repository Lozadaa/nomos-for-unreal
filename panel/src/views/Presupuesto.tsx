import { EmptyState } from '@/components/EmptyState'
import { Tick } from '@/components/Tick'
import { Skeleton } from '@/components/ui/skeleton'
import { useAfter } from '@/hooks/time'
import { useResource } from '@/hooks/useResource'
import { cn } from '@/lib/utils'

type Metric = 'meshyCredits' | 'elevenlabsCredits' | 'tokens' | 'buildMinutes'
interface Summary { limits: Record<Metric, number | null>; spent: Record<Metric, number>; remaining: Record<Metric, number | null> }

const metrics: { key: Metric; name: string; unit: string }[] = [
  { key: 'meshyCredits', name: 'Meshy', unit: 'créditos' },
  { key: 'elevenlabsCredits', name: 'ElevenLabs', unit: 'créditos' },
  { key: 'tokens', name: 'Uso de los modelos de IA', unit: 'unidades' },
  { key: 'buildMinutes', name: 'Compilaciones', unit: 'minutos' },
]

const fmt = (n: number) => new Intl.NumberFormat('es').format(n)

/** Una métrica del presupuesto: cifra grande en mono que hace tick al cambiar y barra fina de progreso. */
export function Meter({ name, unit, spent, limit }: { name: string; unit: string; spent: number; limit: number | null }) {
  const exhausted = limit !== null && spent >= limit
  const ratio = limit ? Math.min(1, spent / limit) : 0
  return (
    <section aria-label={name} className="flex flex-col gap-3 rounded-lg border border-subtle p-6">
      <h3 className="text-sm text-muted-foreground">{name}</h3>
      <p className="flex items-baseline gap-2">
        <Tick value={fmt(spent)} className="text-4xl font-medium tracking-tight" />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </p>
      {limit === null ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm">Sin límite definido</p>
          <p className="text-xs text-muted-foreground">Kratos no se detendrá por gasto.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div role="progressbar" aria-label={`${name}: ${fmt(spent)} de ${fmt(limit)} ${unit}`} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(spent, limit)} className="h-0.5 w-full bg-border">
            <div className={cn('h-full origin-left transition-[width] duration-300 ease-k motion-reduce:duration-75', exhausted ? 'bg-error' : ratio >= 0.8 ? 'bg-warning' : 'bg-info')} style={{ width: `${ratio * 100}%` }} />
          </div>
          <p className="text-sm">{exhausted ? `${name} · límite agotado` : `${name} · ${fmt(spent)} de ${fmt(limit)} ${unit}`}</p>
          {exhausted && <p className="text-xs text-muted-foreground">Kratos te pedirá una decisión antes de seguir.</p>}
        </div>
      )}
    </section>
  )
}

export function Presupuesto() {
  const { data, loading, error } = useResource<Summary>('/budget', /^(run|task|decision|artifact)\./)
  const slow = useAfter(loading)
  if (loading) return slow ? <div role="status" aria-label="Cargando el presupuesto" className="grid grid-cols-2 gap-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40" />)}</div> : null
  if (!data) {
    return error === 'unknown_budget'
      ? <EmptyState title="Sin límite definido" hint="Kratos no se detendrá por gasto." />
      : <p role="alert" className="text-sm text-error">No se pudo cargar el presupuesto: {error}</p>
  }
  return (
    <div className="grid grid-cols-2 gap-4">
      {metrics.map((m) => <Meter key={m.key} name={m.name} unit={m.unit} spent={data.spent[m.key]} limit={data.limits[m.key]} />)}
    </div>
  )
}
