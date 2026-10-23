import { relativeTime } from '@/lib/time'
import { eventText } from '@/lib/events'
import type { TaskDetail } from '@/lib/tasks'

export function TimelineTab({ detail }: { detail: TaskDetail }) {
  if (!detail.events.length) return (
    <div className="flex flex-col items-start gap-2 py-6">
      <p className="text-sm font-medium">Todavía no hay historia</p>
      <p className="text-sm text-muted-foreground">Cada cambio de la tarea queda anotado aquí.</p>
    </div>
  )
  return (
    <ol className="flex flex-col">
      {[...detail.events].reverse().map((e) => (
        <li key={e.seq} className="flex gap-3 border-b border-subtle py-2 text-sm">
          <span className="w-20 shrink-0 text-xs text-muted-foreground">{relativeTime(e.createdAt)}</span>
          <span>{eventText(e)}</span>
        </li>
      ))}
    </ol>
  )
}
