import { useEffect, useRef, useState } from 'react'
import { api } from '@/api'
import { EmptyState } from '@/visual/art/EmptyState'
import { humanError } from '@/lib/errors'
import { Tick } from '@/components/Tick'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAction } from '@/feel/useAction'
import { useAfter } from '@/hooks/time'
import { useResource } from '@/hooks/useResource'
import { Ring } from '@/visual/art/Ring'
import { BRAND } from '@/lib/brand'

type Metric = 'meshyCredits' | 'elevenlabsCredits' | 'tokens' | 'buildMinutes'
interface Summary { scope: 'workspace' | 'task'; scopeId: string; limits: Record<Metric, number | null>; spent: Record<Metric, number>; remaining: Record<Metric, number | null> }

const metrics: { key: Metric; name: string; unit: string }[] = [
  { key: 'meshyCredits', name: 'Meshy', unit: 'credits' },
  { key: 'elevenlabsCredits', name: 'ElevenLabs', unit: 'credits' },
  { key: 'tokens', name: 'AI model usage', unit: 'units' },
  { key: 'buildMinutes', name: 'Builds', unit: 'minutes' },
]

const fmt = (n: number) => new Intl.NumberFormat('en').format(n)

/** Editor en línea del límite de una métrica: PUT /budget con solo esa métrica. */
function LimitEditor({ name, limit, exhausted, save }: { name: string; limit: number | null; exhausted: boolean; save: (value: number) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const returning = useRef(false)
  const close = () => { returning.current = true; setEditing(false) }
  useEffect(() => { if (!editing && returning.current) { trigger.current?.focus(); returning.current = false } }, [editing])
  const parsed = Number(value)
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0
  const action = useAction(() => save(parsed), { success: () => { close(); return { title: `${name} limit saved` } } })
  const label = limit === null ? 'Set limit' : exhausted ? 'Raise limit' : 'Change limit'
  if (!editing) return <Button ref={trigger} variant="outline" size="sm" className="self-start" onClick={() => { setValue(limit === null ? '' : String(limit)); setEditing(true) }}>{label}</Button>
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (valid) void action.fire() }}>
      <Input type="number" inputMode="numeric" min={0} step="any" autoFocus aria-label={`${name} limit`} name="limite" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} className="w-32" />
      <Button type="submit" size="sm" disabled={!valid || action.pending} aria-busy={action.pending}>{action.pending ? 'Saving…' : 'Save'}</Button>
      <Button type="button" variant="ghost" size="sm" disabled={action.pending} onClick={close}>Cancel</Button>
      {action.error && <span role="alert" className="text-xs text-error">Not saved.</span>}
    </form>
  )
}

/** Una métrica del presupuesto: cifra con tick y anillo solo cuando hay un límite real. */
export function Meter({ name, unit, spent, limit, save }: { name: string; unit: string; spent: number; limit: number | null; save?: (value: number) => Promise<unknown> }) {
  const exhausted = limit !== null && spent >= limit
  return (
    <section aria-label={name} className="flex flex-col gap-3 rounded-lg border border-subtle p-6">
      <h3 className="text-sm text-muted-foreground">{name}</h3>
      <p className="flex items-baseline gap-2">
        <Tick value={fmt(spent)} className="text-4xl font-medium tracking-tight" />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </p>
      {limit === null ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm">No limit set</p>
          <p className="text-xs text-muted-foreground">{BRAND.short} won’t stop over spending.</p>
          {save && <LimitEditor name={name} limit={limit} exhausted={false} save={save} />}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div role="progressbar" aria-label={`${name}: ${fmt(spent)} of ${fmt(limit)} ${unit}`} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(spent, limit)} className="self-start">
            <Ring value={limit === 0 ? 1 : spent} max={limit === 0 ? 1 : limit} size={64} />
          </div>
          <p className="text-sm">{exhausted ? `${name} · limit reached` : `${name} · ${fmt(spent)} of ${fmt(limit)} ${unit}`}</p>
          {exhausted && <p className="text-xs text-muted-foreground">{BRAND.short} will ask you before going on.</p>}
          {save && <LimitEditor name={name} limit={limit} exhausted={exhausted} save={save} />}
        </div>
      )}
    </section>
  )
}

export function Presupuesto() {
  const { data, loading, error, reload } = useResource<Summary>('/budget', /^(run|task|decision|artifact|budget)\./)
  const [creating, setCreating] = useState(false)
  const grid = useRef<HTMLDivElement>(null)
  useEffect(() => { if (creating) grid.current?.querySelector<HTMLButtonElement>('button')?.focus() }, [creating])
  const slow = useAfter(loading)
  if (loading) return slow ? <div role="status" aria-label="Loading the budget" className="grid grid-cols-2 gap-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40" />)}</div> : null
  if (!data && !creating) {
    return error === 'unknown_budget'
      ? <EmptyState view="presupuesto" action={{ label: 'Set limit', onClick: () => setCreating(true) }} />
      : <p role="alert" className="text-sm text-error">Couldn’t load the budget. {humanError(new Error(error ?? ""))}</p>
  }
  // Un presupuesto nuevo usa el alcance de proyecto que admite PUT /budget.
  const summary = data ?? { scope: 'workspace', scopeId: 'workspace', limits: Object.fromEntries(metrics.map((m) => [m.key, null])), spent: Object.fromEntries(metrics.map((m) => [m.key, 0])) } as Summary
  return (
    <div ref={grid} className="grid grid-cols-2 gap-4">
      {metrics.map((m) => <Meter key={m.key} name={m.name} unit={m.unit} spent={summary.spent[m.key]} limit={summary.limits[m.key]} save={(n) => api('/budget', { method: 'PUT', body: { scope: summary.scope, scopeId: summary.scopeId, limits: { [m.key]: n } } }).then(reload)} />)}
    </div>
  )
}
