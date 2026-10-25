import { useRef, useState } from 'react'
import { api } from '@/api'
import { DecisionDetails, DecisionOptions, decisionText, repeatText } from '@/components/DecisionOptions'
import { useAction } from '@/feel/useAction'
import { humanError } from '@/lib/errors'
import type { Decision, Task } from '@/lib/tasks'
import { patchTask } from '@/store'

// Decisiones que abre checks.run (comprobación no disponible, assets rotos): también se responden desde la pestaña Pruebas
export const isCheckDecision = (d: Decision) => d.evidence.some((e) => e.kind === 'gate:checks' || e.kind === 'command')

export function DecisionCard({ decision, task, onStale }: { decision: Decision; task: Task; onStale: () => void }) {
  const [chosen, setChosen] = useState<string | null>(null)
  const option = useRef('')
  const action = useAction(
    () => api(`/decisions/${encodeURIComponent(decision.id)}/resolve`, { method: 'POST', body: { optionId: option.current, by: 'director' } }),
    {
      // la fila deja de esperar decisión en el acto; si el servidor la rechaza, vuelve atrás
      optimistic: () => patchTask(task.id, { decisionId: null, blockedReason: task.blockedReason === decision.reason ? null : task.blockedReason }),
      reload: () => { setChosen(null); onStale() },
    },
  )
  const choose = (id: string) => { option.current = id; setChosen(id); void action.fire() }
  return (
    <section aria-label="Decisión pendiente" data-decision-card className="flex flex-col gap-3 rounded-lg border border-subtle bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 aria-label={decision.reason} title={decision.reason} className="text-base font-medium">{decisionText(decision).reason}</h3>
        <DecisionDetails decision={decision} taskTitle={task.title} />
      </div>
      {repeatText(decision) && <p className="text-xs text-muted-foreground">{repeatText(decision)}</p>}
      <DecisionOptions decision={decision} area={task.area} selected={chosen} disabled={action.pending} onChoose={choose} />
      {action.pending && <p className="text-xs text-muted-foreground" role="status">Registrando tu elección…</p>}
      {action.error && !action.pending && <p className="text-xs text-error" role="alert">No se registró la elección. {humanError(action.error)}</p>}
    </section>
  )
}
