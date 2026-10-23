import { useMemo, useState, type ComponentType, type SVGProps } from 'react'
import { humanError } from '@/lib/errors'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAction } from '@/feel/useAction'
import { useAfter, useNow } from '@/hooks/time'
import { useResource } from '@/hooks/useResource'
import { useRuns } from '@/hooks/useRuns'
import { relativeTime } from '@/lib/time'
import type { Tone } from '@/lib/tasks'
import { useStore } from '@/store'
import { Glyph } from '@/visual/Glyph'
import { glyphFor } from '@/visual/glyphs'
import { AvatarGroup, type AvatarGroupAgent } from '@/visual/art/AvatarGroup'
import { assignAgentNames } from '@/visual/art/agentName'
import type { AgentAvatarState } from '@/visual/art/AgentAvatar'
import { EmptyState } from '@/visual/art/EmptyState'

interface Capability { id: string; label: string; state: 'ausente' | 'detectado' | 'comprobado' | 'roto'; detail: string }

const look: Record<Capability['state'], { tone: Tone; text: string; action: string }> = {
  ausente: { tone: 'neutral', text: 'No instalado', action: 'Ver cómo instalar' },
  detectado: { tone: 'info', text: 'Detectado · sin comprobar', action: 'Comprobar ahora' },
  comprobado: { tone: 'success', text: 'Comprobado', action: 'Volver a comprobar' },
  roto: { tone: 'error', text: 'No responde', action: 'Reintentar' },
}

const capabilityProvider: Record<string, string> = {
  codex: 'codex', claude: 'claude', opencode: 'opencode', unreal: 'unreal', unreal_mcp: 'unreal',
  launcher: 'launcher', meshy: 'meshy', blender: 'blender', kratos: 'kratos',
}

/** Se reutiliza la forma del registro, con la etiqueta de la capacidad que se está comprobando. */
function CapabilityState({ state }: { state: Capability['state'] }) {
  const spec = state === 'roto' ? glyphFor('directorState', 'vigilanteCaido')
    : glyphFor('taskState', state === 'detectado' ? 'revisando' : state === 'comprobado' ? 'done' : 'pendiente')
  const Icon = spec.Icon as ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
  const tones: Record<Tone, string> = { neutral: 'text-neutral', info: 'text-info', success: 'text-success', error: 'text-error', warning: 'text-warning' }
  return <Icon size={16} role="img" aria-label={look[state].text} aria-hidden={undefined} className={`shrink-0 ${tones[look[state].tone]}`} />
}

function Row({ cap, checkedAt, onChecked, now }: { cap: Capability; checkedAt?: number; onChecked: (list: Capability[]) => void; now: number }) {
  const [help, setHelp] = useState(false)
  const l = look[cap.state]
  const provider = Object.hasOwn(capabilityProvider, cap.id) ? capabilityProvider[cap.id] : undefined
  // «Comprobar» vuelve a detectar en el equipo: el servicio solo distingue presente/ausente, así que no se promete más que eso
  const check = useAction(() => api<Capability[]>('/capabilities').then((list) => { onChecked(list); return list }))
  const onClick = cap.state === 'ausente' ? () => setHelp((v) => !v) : () => void check.fire()
  return (
    <li className="flex flex-col border-b border-subtle last:border-b-0">
      <div className="flex h-14 items-center gap-4 px-4 text-sm">
        <CapabilityState state={cap.state} />
        <span className="flex w-48 shrink-0 items-center gap-2 font-medium">
          {provider && <Glyph kind="provider" value={provider} />}
          {(!provider || cap.label !== glyphFor('provider', provider).label) && <span>{cap.label}</span>}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{l.text}{checkedAt ? ` · revisado ${relativeTime(new Date(checkedAt).toISOString(), now)}` : ''}</span>
        <Button variant="outline" size="sm" disabled={check.pending} aria-busy={check.pending} aria-expanded={cap.state === 'ausente' ? help : undefined} onClick={onClick}>
          {check.pending ? 'Comprobando…' : l.action}
        </Button>
      </div>
      {help && cap.state === 'ausente' && <p className="px-4 pb-3 pl-10 text-sm text-muted-foreground">{cap.detail}. Instálalo y pulsa «Comprobar ahora».</p>}
      {check.error && <p role="alert" className="px-4 pb-3 pl-10 text-xs text-error">No se pudo comprobar. {humanError(check.error)}</p>}
    </li>
  )
}

export function Capacidades() {
  const { data, loading, error, mutate } = useResource<Capability[]>('/capabilities')
  const runs = useRuns()
  const tasks = useStore((s) => s.tasks)
  const waiting = useStore((s) => s.waiting)
  const groups = useMemo(() => {
    const byTask = new Map(tasks.map((task) => [task.id, task]))
    // El ordinal se calcula antes de separar proveedores: un UI Worker de OpenCode puede duplicar uno de Codex.
    const agents = assignAgentNames([...runs]
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
      .map((run) => ({
        id: run.id, provider: run.provider, role: run.role, area: byTask.get(run.taskId)?.area,
        state: (run.state === 'running' ? run.waiting || waiting[run.taskId]?.runId === run.id ? 'waiting' : 'running' : 'idle') as AgentAvatarState,
      })))
    const providers = new Map<string, AvatarGroupAgent[]>()
    for (const agent of agents) {
      const group = providers.get(agent.provider) ?? []
      group.push(agent)
      providers.set(agent.provider, group)
    }
    return [...providers].map(([provider, agents]) => ({ provider, agents }))
  }, [runs, tasks, waiting])
  const [checked, setChecked] = useState<Record<string, number>>({})
  const slow = useAfter(loading)
  const now = useNow(10000)

  if (error && !data) return <p role="alert" className="text-sm text-error">No se pudieron cargar las capacidades. {humanError(new Error(error))}</p>
  if (loading) return slow ? <div role="status" aria-label="Cargando las capacidades" className="flex flex-col gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div> : null
  return (
    <div className="flex flex-col gap-6">
      {groups.length > 0 && <section aria-label="Agentes" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Agentes</h2>
        <ul aria-label="Agentes por proveedor" className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          {groups.map(({ provider, agents }) => <li key={provider} className="flex flex-col gap-3 rounded-lg border border-subtle p-4">
            <AvatarGroup agents={agents} size={48} />
            <ul aria-label={`Nombres de ${glyphFor('provider', provider).label}`} className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {agents.map((agent) => <li key={agent.id} title={glyphFor('provider', provider).label}>{agent.name}</li>)}
            </ul>
          </li>)}
        </ul>
      </section>}
      {!data?.length ? <EmptyState view="capacidades" /> : <ul aria-label="Capacidades" className="overflow-hidden rounded-lg border border-subtle">
        {data?.map((cap) => (
          <Row key={cap.id} cap={cap} checkedAt={checked[cap.id]} now={now}
            onChecked={(list) => { mutate(() => list); setChecked((c) => ({ ...c, [cap.id]: Date.now() })) }} />
        ))}
      </ul>}
    </div>
  )
}
