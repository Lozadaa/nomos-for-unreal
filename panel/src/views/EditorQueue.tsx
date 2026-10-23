import { useResource } from '@/hooks/useResource'
import { AgentAvatar, type AgentAvatarState } from '@/visual/art/AgentAvatar'

export interface EditorSlot {
  project: string
  busy: { runId: string; taskId: string; since: string; agent: string; provider: string | null; role: string | null } | null
}
export type NamedAgent = { name: string; provider: string; state: AgentAvatarState; ordinal?: number }

/** Un editor por proyecto (reserva `editor/<proyecto>`): quién lo tiene ahora; el resto de peticiones espera en cola. */
export function EditorQueue({ agents }: { agents: Map<string, NamedAgent> }) {
  const { data } = useResource<EditorSlot[]>('/editors', /^(editor\.|lease\.)/)
  if (!data?.length) return null
  return (
    <section aria-label="Editor de Unreal" className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">Editor de Unreal</h2>
      <ul className="overflow-hidden rounded-lg border border-subtle">
        {data.map((slot) => {
          const agent = slot.busy ? agents.get(slot.busy.runId) : undefined
          const who = agent?.name ?? slot.busy?.agent
          return (
            <li key={slot.project} className="flex h-14 items-center gap-4 border-b border-subtle px-4 text-sm last:border-b-0">
              {slot.busy && <AgentAvatar provider={agent?.provider ?? slot.busy.provider ?? 'unreal'} name={who} state={agent?.state ?? 'running'} ordinal={agent?.ordinal} size={24} />}
              <span className="font-medium">{slot.project}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={slot.busy ? `Desde ${slot.busy.since}` : undefined}>
                {slot.busy ? `Ocupado por ${who}` : 'Libre'}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
