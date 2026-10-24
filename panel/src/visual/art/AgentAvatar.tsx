import { memo, type CSSProperties } from 'react'
import { glyphFor } from '../glyphs'

export type AgentAvatarState = 'running' | 'waiting' | 'idle'
export interface AgentAvatarProps {
  id?: string
  provider: string
  name?: string
  size?: number
  state?: AgentAvatarState
  /** Solo lo suministra el caller al detectar nombres duplicados entre agentes vivos. */
  ordinal?: number
  /** Compatibilidad de llamadas antiguas; no determina nombre ni insignia. */
  instance?: number
}

const monograms: Record<string, string> = {
  codex: 'Cx', claude: 'Cl', opencode: 'Oc', meshy: 'Me', blender: 'Bl', unreal: 'Un', kratos: 'Kr', launcher: 'La',
}

/** Tooltip del agente: proveedor, modelo Claude (workerModel) y skills confirmadas. */
export function agentTitle(provider: string, model?: string, skills?: readonly string[]) {
  return [glyphFor('provider', provider).label, model && `modelo ${model}`, skills?.length && `skills confirmadas: ${skills.join(', ')}`]
    .filter(Boolean).join(' · ')
}

/** Implementador por monograma; el estado y las pinturas viven en theme.css. */
export const AgentAvatar = memo(function AgentAvatar({ provider, name, size = 24, state = 'idle', ordinal, skills, model }: AgentAvatarProps & { skills?: readonly string[]; model?: string }) {
  const spec = glyphFor('provider', provider)
  const color = spec.tone === 'primary' ? 'var(--vbg-color-primary)' : `var(--k-${spec.tone})`
  const badge = state !== 'idle' && ordinal !== undefined && Number.isInteger(ordinal) && ordinal >= 1
  const monogram = Object.hasOwn(monograms, provider) ? monograms[provider] : (provider.slice(0, 1).toUpperCase() + provider.slice(1, 2).toLowerCase())
  return <span role="img" aria-label={name ? `${name} · ${spec.label}` : spec.label} title={agentTitle(provider, model, skills)}
    data-provider={provider} data-state={state} className="k-agent-avatar"
    style={{ '--agent-size': `${size}px`, '--agent-color': color } as CSSProperties}>
    <span className="k-agent-monogram" aria-hidden="true">{monogram || '?'}</span>
    {badge && <span className="k-agent-ordinal" aria-hidden="true">{ordinal}</span>}
  </span>
})
