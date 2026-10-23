import { useState } from 'react'
import { areaLabel, areas, type Stage } from '@/lib/tasks'
import { Glyph } from './Glyph'
import { AgentAvatar } from './art/AgentAvatar'
import { AvatarGroup } from './art/AvatarGroup'
import { agentName } from './art/agentName'
import { AreaPictogram } from './art/AreaPictogram'
import { EmptyState } from './art/EmptyState'
import { ProductionMap } from './art/ProductionMap'
import { Ring } from './art/Ring'
import { DiffBars } from './art/DiffBars'
import { catalog, type ArtView } from './art/catalog'
import { productionExample, productionRuns } from './art/production-example'


export function ArtGallery() {
  const [stage, setStage] = useState<Stage | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const tasks = productionExample.map((task, i) => advanced && i === 4 ? { ...task, state: 'revisando' as const } : task)
  const agents = productionRuns.map((run, i) => ({ ...run, name: agentName(['implementacion', 'revisor', 'arte'][i], ['animacion', 'qa', 'audio'][i]), state: 'running' as const }))
  return <div className="flex flex-col gap-5">
    <div aria-label="Agentes de las ejecuciones de ejemplo">
      <AvatarGroup agents={agents} size={32} />
    </div>
    <div className="flex flex-wrap items-center gap-8" aria-label="Estados del avatar">
      {([{ provider: 'codex', name: 'UI Worker', state: 'running', label: 'En curso' }, { provider: 'claude', name: 'UI Master', state: 'waiting', label: 'Espera respuesta' }, { provider: 'opencode', name: 'UI Worker', state: 'idle', label: 'Libre' }] as const).map((agent) => <div key={agent.state} className="flex items-center gap-3">
        <AgentAvatar {...agent} size={32} />
        <span className="flex flex-col text-xs"><span>{agent.name}</span><span className="text-muted-foreground">{agent.label}</span></span>
      </div>)}
    </div>
    <div className="grid grid-cols-8 gap-3" aria-label="Pictogramas de áreas">
      {areas.map((area) => <figure key={area} className="flex flex-col items-center gap-1"><AreaPictogram area={area} /><figcaption className="text-xs text-muted-foreground">{areaLabel[area]}</figcaption></figure>)}
    </div>
    <div className="rounded-lg border border-subtle p-3">
      <ProductionMap tasks={tasks} onSelect={(next) => setStage(stage === next ? null : next)} />
      <div className="flex min-h-7 items-center justify-between gap-4 text-xs">
        <div aria-live="polite" className="flex flex-wrap items-center gap-2">
          {stage ? <><Glyph kind="taskState" value={stage} showLabel /><span className="font-mono">{tasks.filter((t) => t.state === stage).map((t) => t.id.slice(-2)).join(' · ') || '0'}</span></> : <span className="font-mono text-muted-foreground">12 tareas</span>}
        </div>
        <button type="button" className="rounded-md border border-subtle px-2 py-1 hover:border-strong focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => setAdvanced(!advanced)}>Mover tarea 05</button>
      </div>
    </div>
    <div className="grid grid-cols-[80px_1fr] items-center gap-8" aria-label="Gráficos de ejemplo">
      <figure className="flex flex-col items-center gap-1"><Ring value={60} max={100} size={64} /><figcaption className="text-xs text-muted-foreground">60 / 100 créditos</figcaption></figure>
      <figure><figcaption className="mb-2 text-xs text-muted-foreground">Cambios en tres archivos</figcaption><div className="h-20 [&_svg]:h-20"><DiffBars added={[12, 24, 8]} removed={[4, 2, 10]} files={['Movimiento.ts', 'Escena.ts', 'Interfaz.tsx']} /></div></figure>
    </div>
    <div className="grid grid-cols-4 gap-3" aria-label="Estados vacíos por vista">
      {(Object.keys(catalog) as ArtView[]).map((view) => <figure key={view} className="overflow-hidden rounded-lg border border-subtle">
        <EmptyState view={view} />
      </figure>)}
    </div>
  </div>
}
