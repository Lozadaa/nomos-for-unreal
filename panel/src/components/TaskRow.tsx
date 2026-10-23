import { memo } from 'react'
import { StatusDot } from './StatusDot'
import { nameFor } from '@/feel/transitions'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { isTemp, providerLabel, shortId, statusOf, statusText, toneOf, type Task } from '@/lib/tasks'

export const rowColumns = 'grid grid-cols-[8px_minmax(0,1fr)_minmax(0,200px)_150px_88px] items-center gap-x-4'

function TaskRowView({ task, now, open, onOpen }: { task: Task; now: number; open: boolean; onOpen: (task: Task, from: HTMLElement) => void }) {
  const temp = isTemp(task.id)
  const status = statusOf(task)
  const provider = task.assigneeProvider ? (providerLabel[task.assigneeProvider] ?? task.assigneeProvider) : null
  return (
    <button
      type="button"
      data-task-id={task.id}
      data-temp={temp ? '' : undefined}
      aria-label={`${task.title}, ${statusText(task)}`}
      onClick={(e) => onOpen(task, e.currentTarget)}
      disabled={temp}
      style={{ viewTransitionName: nameFor('row', task.id), viewTransitionClass: 'k-row' } as React.CSSProperties}
      className={cn(rowColumns, 'h-12 w-full cursor-pointer border-b border-subtle bg-background px-4 text-left text-sm outline-offset-[-2px] transition-colors duration-(--k-dur-micro) hover:bg-card active:bg-muted disabled:cursor-default disabled:hover:bg-background')}
    >
      <StatusDot tone={toneOf(task)} pulse={temp} />
      <span className="flex min-w-0 items-baseline gap-3">
        <span
          className="truncate font-medium"
          style={{ viewTransitionName: open ? undefined : nameFor('task', task.id), viewTransitionClass: 'k-title' } as React.CSSProperties}
          title={task.title}
        >
          {task.title}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{temp ? 'enviando' : shortId(task.id)}</span>
      </span>
      <span className="truncate text-muted-foreground">
        {[task.assigneeRole, provider].filter(Boolean).join(' · ') || 'Sin responsable'}
      </span>
      <span className={cn('truncate', status === 'normal' ? 'text-muted-foreground' : status === 'decision' || task.state === 'cerrando' ? 'text-warning' : 'text-error')}>
        {statusText(task)}
      </span>
      <span className="text-right text-xs text-muted-foreground tabular-nums">{temp ? 'ahora' : relativeTime(task.updatedAt, now)}</span>
    </button>
  )
}

export const TaskRow = memo(TaskRowView)
