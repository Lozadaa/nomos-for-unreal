import { memo } from 'react'
import { StatusDot } from './StatusDot'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { nameFor } from '@/feel/transitions'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { areaLabel, isTemp, providerLabel, rowReason, shortId, stageLabel, statusOf, statusText, toneOf, type Run, type Task } from '@/lib/tasks'
import { Glyph } from '@/visual/Glyph'
import { AgentAvatar } from '@/visual/art/AgentAvatar'
import { agentName } from '@/visual/art/agentName'

export const rowColumns = 'grid grid-cols-[20px_36px_minmax(0,1fr)_auto_64px] items-center gap-x-4'

function TaskRowView({ task, run, agent, now, open, onOpen }: {
  task: Task; run?: Run & { waiting?: boolean }; agent?: { name: string; ordinal?: number }; now: number; open: boolean; onOpen: (task: Task, from: HTMLElement) => void
}) {
  const temp = isTemp(task.id)
  const waitingSignal = useStore((s) => s.waiting[task.id])
  const waiting = run?.state === 'running' && (run.waiting || waitingSignal?.runId === run.id)
  const state = run?.state === 'running' ? waiting ? 'waiting' : 'running' : 'idle'
  const name = agent?.name ?? agentName(run?.role ?? task.assigneeRole, task.area)
  const implementer = run?.provider ?? task.assigneeProvider
  const status = statusOf(task)
  const provider = implementer ? providerLabel[implementer] ?? implementer : 'Sin responsable'
  const identity = [areaLabel[task.area], statusText(task), provider, `Etapa: ${stageLabel[task.state]}`, ...(implementer ? [name] : [])]
  const reason = rowReason(task)
  const detail = task.failure ? task.failure.text : task.waitReason
  const description = `${identity.join(' · ')}${task.blockedReason ? ` · ${task.blockedReason}` : ''}${detail ? ` · ${detail}` : ''}${waiting ? ` · Esperando respuesta${waitingSignal?.runId === run?.id ? `: ${waitingSignal.question}` : ''}` : ''}`
  return (
    <Tooltip>
      <TooltipTrigger render={<button
        type="button" data-task-id={task.id} data-temp={temp ? '' : undefined}
        aria-label={[task.title, ...identity].join(', ')}
        onClick={(e) => onOpen(task, e.currentTarget)} disabled={temp}
        style={{ viewTransitionName: nameFor('row', task.id), viewTransitionClass: 'k-row' } as React.CSSProperties}
        className={cn(rowColumns, 'h-12 w-full cursor-pointer border-b border-subtle bg-background px-4 text-left text-sm outline-offset-[-2px] transition-colors duration-(--k-dur-micro) hover:bg-card active:bg-muted disabled:cursor-default disabled:hover:bg-background')}
      />}>
        <Glyph kind="area" value={task.area} />
        <span className="flex items-center gap-1.5">
          <Glyph kind="taskState" value={status === 'normal' ? task.state : status} />
          <StatusDot tone={toneOf(task)} pulse={temp} className="size-1.5" />
          <span className="sr-only">{statusText(task)}</span>
        </span>
        <span className="flex min-w-0 items-baseline gap-3">
          <span data-task-title className="truncate font-medium" title={task.title}
            style={{ viewTransitionName: open ? undefined : nameFor('task', task.id), viewTransitionClass: 'k-title' } as React.CSSProperties}>{task.title}</span>
          <span data-task-id-text className="shrink-0 font-mono text-xs text-muted-foreground">{temp ? 'enviando' : shortId(task.id)}</span>
          {reason && <span data-task-reason className={cn('shrink-0 text-xs', task.failure ? 'text-error' : 'text-muted-foreground')}>{reason}</span>}
        </span>
        {implementer ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <AgentAvatar id={run?.id} provider={implementer} model={run?.metadata?.model} name={name} state={state} ordinal={state === 'idle' ? undefined : agent?.ordinal} size={24} />
            <span>{name}</span>
            {waiting && <span className="sr-only">Esperando respuesta</span>}
          </span>
        ) : <span className="text-xs text-muted-foreground">Sin responsable</span>}
        <time dateTime={task.updatedAt} className="text-right text-xs text-muted-foreground tabular-nums">{temp ? 'ahora' : relativeTime(task.updatedAt, now).replace(/^hace /, '')}</time>
      </TooltipTrigger>
      <TooltipContent role="tooltip">{description}</TooltipContent>
    </Tooltip>
  )
}

export const TaskRow = memo(TaskRowView)
