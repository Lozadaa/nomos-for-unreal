import { cn } from '@/lib/utils'
import { stageLabel, stages, statusOf, type Task } from '@/lib/tasks'

/** Etapa horizontal de la tarea. Si está bloqueada o espera una decisión, la etapa se conserva y se marca. */
export function StageStepper({ task }: { task: Pick<Task, 'state' | 'blockedReason' | 'decisionId'> }) {
  const current = stages.indexOf(task.state)
  const status = statusOf(task)
  return (
    <ol aria-label="Etapa" className="flex">
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
            <span aria-hidden className={cn('absolute top-[3px] left-0 h-px w-full', i <= current ? 'bg-foreground/60' : 'bg-border')} />
            <span
              aria-hidden
              className={cn('relative size-2 rounded-full transition-colors duration-(--k-dur-standard)',
                marked ? (status === 'decision' ? 'bg-warning' : 'bg-error') : i < current ? 'bg-foreground/60' : here ? 'bg-foreground' : 'bg-border',
                here && 'ring-4 ring-foreground/15')}
            />
            <span className={cn('whitespace-nowrap', here ? 'text-foreground' : 'text-muted-foreground')}>
              {stageLabel[stage]}
              {marked && <span className="sr-only">{status === 'decision' ? ' (espera decisión)' : ' (bloqueada)'}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
