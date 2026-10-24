import { useEffect, useRef, useState } from 'react'
import { humanError } from '@/lib/errors'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAction } from '@/feel/useAction'
import { addOptimistic, confirmOptimistic } from '@/store'
import { areaLabel, areas, type Area, type Task } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { AreaPictogram } from '@/visual/art/AreaPictogram'
import { BRAND } from '@/lib/brand'

const empty = { title: '', spec: '', area: 'gameplay' as Area }

/** Una línea que se expande en el sitio: título → descripción → área → «Enviar a Nomos». Sin modal. */
export function Composer({ autoFocus = false, isVisible, onHidden }: {
  autoFocus?: boolean
  /** ¿la tarea nueva se verá con los filtros actuales? Si no, el éxito deja un toast con «Ver». */
  isVisible: (task: Task) => boolean
  onHidden: (task: Task) => void
}) {
  const [draft, setDraft] = useState(empty)
  const [open, setOpen] = useState(autoFocus)
  const [missing, setMissing] = useState(false)
  const title = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLFormElement>(null)
  const tmp = useRef('')
  const sent = useRef(empty)

  useEffect(() => { if (autoFocus) title.current?.focus() }, [autoFocus])

  const send = useAction(
    async () => {
      const task = await api<Task>('/tasks', { method: 'POST', body: { title: sent.current.title.trim(), spec: sent.current.spec, area: sent.current.area, acceptance: [] } })
      confirmOptimistic(tmp.current, task)
      return task
    },
    {
      optimistic: () => {
        sent.current = draft
        tmp.current = `tmp-${Date.now()}`
        const now = new Date().toISOString()
        const undo = addOptimistic({
          id: tmp.current, createdAt: now, updatedAt: now, title: draft.title.trim(), spec: draft.spec, acceptance: [], state: 'pendiente',
          blockedReason: null, decisionId: null, area: draft.area, assigneeRole: null, assigneeProvider: null, parentTaskId: null,
          dependsOn: [], worktreeId: null, budgetId: null,
        })
        setDraft(empty)
        return () => { undo(); setDraft(sent.current) }
      },
      success: (task) => (isVisible(task) ? undefined : { title: 'Petición enviada', description: 'Está fuera de los filtros activos.', action: { label: 'Ver', onClick: () => onHidden(task) } }),
      error: (e) => ({ title: 'No se pudo enviar la petición', description: humanError(e), action: { label: 'Reintentar', onClick: () => void send.fire() } }),
    },
  )

  const submit = () => {
    if (!draft.title.trim()) { setMissing(true); title.current?.focus(); return }
    setMissing(false)
    void send.fire()
  }

  return (
    <form
      data-tour-anchor="composer"
      ref={root}
      aria-label="Nueva petición"
      onSubmit={(e) => { e.preventDefault(); submit() }}
      onFocus={() => setOpen(true)}
      onBlur={(e) => { if (!root.current?.contains(e.relatedTarget) && !draft.title && !draft.spec) setOpen(false) }}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit() } }}
      className="rounded-lg border border-subtle bg-card p-2 transition-colors duration-(--k-dur-micro) focus-within:border-strong"
    >
      <Input
        ref={title}
        value={draft.title}
        onChange={(e) => { setDraft({ ...draft, title: e.target.value }); setMissing(false) }}
        placeholder={`Pídele algo a ${BRAND.short}…`} name="titulo" autoComplete="off"
        aria-label="Título de la petición"
        aria-invalid={missing || undefined}
        aria-describedby={missing ? 'composer-missing' : undefined}
        className="h-9 border-0 bg-transparent px-2 text-sm focus-visible:ring-0"
      />
      <div
        className={cn('grid transition-[grid-template-rows,opacity] duration-(--k-dur-standard) ease-k motion-reduce:duration-75', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}
        inert={!open}
      >
        <div className="overflow-hidden">
          <Textarea
            value={draft.spec}
            onChange={(e) => setDraft({ ...draft, spec: e.target.value })}
            placeholder="Describe qué quieres construir (opcional)…" name="descripcion" autoComplete="off"
            aria-label="Descripción"
            className="mt-1 min-h-20 resize-none border-0 bg-transparent px-2 text-sm focus-visible:ring-0"
          />
          <div className="flex items-center gap-3 px-2 pt-2 pb-1">
            <label title={`Área: ${areaLabel[draft.area]}`} className="relative inline-flex size-12 shrink-0 items-center justify-center rounded-md border border-input bg-background focus-within:outline-2 focus-within:outline-ring focus-within:outline-offset-2">
              <AreaPictogram area={draft.area} size={32} />
              <select
                value={draft.area}
                onChange={(e) => setDraft({ ...draft, area: e.target.value as Area })}
                name="area"
                aria-label="Área"
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              >
                {areas.map((a) => <option key={a} value={a}>{areaLabel[a]}</option>)}
              </select>
            </label>
            {missing && <span id="composer-missing" role="alert" className="text-xs text-error">Escribe un título para la petición.</span>}
            {send.error && <span role="alert" className="text-xs text-error">No se envió. {humanError(send.error)}</span>}
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline"><kbd className="font-mono">Ctrl</kbd>+<kbd className="font-mono">Enter</kbd></span>
            <Button type="submit" size="sm" disabled={send.pending} aria-busy={send.pending}>
              {send.pending ? 'Enviando…' : `Enviar a ${BRAND.short}`}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}
