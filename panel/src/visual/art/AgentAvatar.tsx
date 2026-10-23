import { memo } from 'react'
import { glyphFor } from '../glyphs'
import { ProviderPill } from '../ProviderPill'

/** Instancia explícita, sufijo numérico del id o 1 para ids opacos. */
export const AgentAvatar = memo(function AgentAvatar({ id, provider, instance, size = 24 }: {
  id: string; provider: string; instance?: number; size?: number
}) {
  const spec = glyphFor('provider', provider)
  const number = instance ?? Number(id.match(/(?:^|[-_])(\d+)$/)?.[1] ?? 1)
  return <ProviderPill label={`${spec.label} ${number}`} tone={spec.tone} size={size} />
})
