import { memo, type CSSProperties } from 'react'
import { glyphFor } from '../glyphs'
import { AgentAvatar, type AgentAvatarState } from './AgentAvatar'

export interface AvatarGroupAgent { id: string; provider: string; name: string; state: AgentAvatarState; ordinal?: number; skills?: readonly string[]; model?: string }

/** Tres avatares visibles; el cuarto lugar resume los restantes sin perder los totales reales. */
export const AvatarGroup = memo(function AvatarGroup({ agents, size = 32 }: { agents: readonly AvatarGroupAgent[]; size?: number }) {
  const providers = new Map<string, { total: number; active: number }>()
  for (const agent of agents) {
    const count = providers.get(agent.provider) ?? { total: 0, active: 0 }
    count.total++
    if (agent.state === 'running' || agent.state === 'waiting') count.active++
    providers.set(agent.provider, count)
  }
  if (agents.length === 0) return null
  return <div className="k-avatar-group">
    <div className="k-avatar-stack" style={{ '--agent-size': `${size}px` } as CSSProperties}>
      {agents.slice(0, 3).map((agent) => <AgentAvatar key={agent.id} {...agent} size={size} />)}
      {agents.length > 3 && <span className="k-avatar-overflow" aria-label={`${agents.length - 3} more agents`}>+{agents.length - 3}</span>}
    </div>
    <div className="k-avatar-summary">
      {[...providers].map(([provider, count]) => <p key={provider}>{count.total} {glyphFor('provider', provider).label} · {count.active} active</p>)}
    </div>
  </div>
})
