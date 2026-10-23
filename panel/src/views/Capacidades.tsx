import { useState } from 'react'
import { api } from '@/api'
import { StatusDot } from '@/components/StatusDot'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAction } from '@/feel/useAction'
import { useAfter, useNow } from '@/hooks/time'
import { useResource } from '@/hooks/useResource'
import { relativeTime } from '@/lib/time'
import type { Tone } from '@/lib/tasks'

interface Capability { id: string; label: string; state: 'ausente' | 'detectado' | 'comprobado' | 'roto'; detail: string }

const look: Record<Capability['state'], { tone: Tone; text: string; action: string }> = {
  ausente: { tone: 'neutral', text: 'No instalado', action: 'Ver cómo instalar' },
  detectado: { tone: 'info', text: 'Detectado · sin comprobar', action: 'Comprobar ahora' },
  comprobado: { tone: 'success', text: 'Comprobado', action: 'Volver a comprobar' },
  roto: { tone: 'error', text: 'No responde', action: 'Reintentar' },
}

function Row({ cap, checkedAt, onChecked, now }: { cap: Capability; checkedAt?: number; onChecked: (list: Capability[]) => void; now: number }) {
  const [help, setHelp] = useState(false)
  const l = look[cap.state]
  // «Comprobar» vuelve a detectar en el equipo: el servicio solo distingue presente/ausente, así que no se promete más que eso
  const check = useAction(() => api<Capability[]>('/capabilities').then((list) => { onChecked(list); return list }))
  const onClick = cap.state === 'ausente' ? () => setHelp((v) => !v) : () => void check.fire()
  return (
    <li className="flex flex-col border-b border-subtle last:border-b-0">
      <div className="flex h-14 items-center gap-4 px-4 text-sm">
        <StatusDot tone={l.tone} />
        <span className="w-48 shrink-0 font-medium">{cap.label}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{l.text}{checkedAt ? ` · revisado ${relativeTime(new Date(checkedAt).toISOString(), now)}` : ''}</span>
        <Button variant="outline" size="sm" disabled={check.pending} aria-busy={check.pending} aria-expanded={cap.state === 'ausente' ? help : undefined} onClick={onClick}>
          {check.pending ? 'Comprobando…' : l.action}
        </Button>
      </div>
      {help && cap.state === 'ausente' && <p className="px-4 pb-3 pl-10 text-sm text-muted-foreground">{cap.detail}. Instálalo y pulsa «Comprobar ahora».</p>}
      {check.error && <p role="alert" className="px-4 pb-3 pl-10 text-xs text-error">No se pudo comprobar: {check.error.message}</p>}
    </li>
  )
}

export function Capacidades() {
  const { data, loading, error, mutate } = useResource<Capability[]>('/capabilities')
  const [checked, setChecked] = useState<Record<string, number>>({})
  const slow = useAfter(loading)
  const now = useNow(10000)

  if (error && !data) return <p role="alert" className="text-sm text-error">No se pudieron cargar las capacidades: {error}</p>
  if (loading) return slow ? <div role="status" aria-label="Cargando las capacidades" className="flex flex-col gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div> : null
  return (
    <ul aria-label="Capacidades" className="overflow-hidden rounded-lg border border-subtle">
      {data?.map((cap) => (
        <Row key={cap.id} cap={cap} checkedAt={checked[cap.id]} now={now}
          onChecked={(list) => { mutate(() => list); setChecked((c) => ({ ...c, [cap.id]: Date.now() })) }} />
      ))}
    </ul>
  )
}
