import { cn } from '@/lib/utils'
import { stageLabel, stages, statusOf, type Task } from '@/lib/tasks'
import { Glyph } from '@/visual/Glyph'

/** Etapa horizontal de la tarea. Si está bloqueada o espera una decisión, la etapa se conserva y se marca. */
export function StageStepper({ task }: { task: Pick<Task, 'state' | 'blockedReason' | 'decisionId'> }) {
  const current = stages.indexOf(task.state)
  const status = statusOf(task)
  return (
    <ol aria-label="Stage" className="flex">
      {stages.map((stage, i) => {
        const here = i === current
        const marked = here && status !== 'normal'
        return (
          <li
            key={stage}
            data-stage={stage}
            data-blocked={marked && status === 'bloqueada' ? '' : undefined}
            data-decision={marked && status === 'decision' ? '' : undefined}
            aria-current={here ? 'step' : undefined}
            className="relative flex flex-auto flex-col items-start gap-2 pr-2 text-xs last:flex-none last:pr-0"
          >
            <span aria-hidden className={cn('absolute top-3 left-0 h-px w-full', i <= current ? 'bg-foreground/60' : 'bg-border')} />
            <span className={cn('relative inline-flex size-6 items-center justify-center rounded-md bg-popover', here && 'ring-2 ring-foreground/15', marked && (status === 'decision' ? 'ring-warning' : 'ring-error'))}>
              <Glyph kind="taskState" value={stage} size={18} />
            </span>
            <span className={cn('whitespace-nowrap', here ? 'text-foreground' : 'sr-only')}>
              {stageLabel[stage]}
              {marked && <span className="sr-only">{status === 'decision' ? ' (waiting on a decision)' : ' (blocked)'}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
