import { useState } from 'react'
import { EmptyState } from '@/visual/art/EmptyState'
import { Meter } from './Presupuesto'
import { RowsSkeleton, SheetSkeleton } from '@/components/Skeletons'
import { StageStepper } from '@/components/StageStepper'
import { StatusDot } from '@/components/StatusDot'
import { TaskRow } from '@/components/TaskRow'
import { Tick } from '@/components/Tick'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { toasts } from '@/feel/toasts'
import { durations } from '@/feel/motion'
import type { Task, Tone } from '@/lib/tasks'
import { GlyphLegend } from '@/visual/Glyph'
import { ArtGallery } from '@/visual/ArtGallery'
import { BRAND } from '@/lib/brand'

const sections = [
  ['glifos', 'Glyphs'], ['arte', 'Art'],
  ['colores', 'Colors'], ['tipografia', 'Type'], ['estado', 'Status dots'], ['botones', 'Buttons and fields'],
  ['filas', 'Production rows'], ['etapas', 'Task stage'], ['movimiento', 'Motion'], ['cifras', 'Numbers'],
  ['vacios', 'Empty and loading'], ['avisos', 'Toasts'],
] as const

const base = (n: number, over: Partial<Task>): Task => ({
  id: `estilo-${n}000000`, createdAt: '2026-10-23T10:00:00.000Z', updatedAt: new Date(Date.now() - n * 7 * 60_000).toISOString(),
  title: `Sample task ${n}`, spec: '', acceptance: [], state: 'implementando', blockedReason: null, decisionId: null, area: 'gameplay',
  assigneeRole: 'desarrollador', assigneeProvider: 'codex', parentTaskId: null, dependsOn: [], worktreeId: null, budgetId: null, ...over,
})

const normal: Task[] = [
  base(1, { state: 'pendiente', title: 'Define jump', assigneeRole: null, assigneeProvider: null }),
  base(2, { state: 'implementando', title: 'Meteor ability' }),
  base(3, { state: 'revisando', title: 'Review combat', assigneeProvider: 'claude' }),
  base(4, { state: 'implementando', title: 'Pick base character', decisionId: 'd', blockedReason: 'Choose between two candidates.' }),
  base(5, { state: 'probando', title: 'Playtest route', blockedReason: 'Texture pack missing.' }),
  base(6, { state: 'cerrando', title: 'Remove worktree', blockedReason: 'A worktree was left behind.' }),
  base(7, { state: 'done', title: 'Publish report' }),
]

// peor caso realista: nombre largo con emoji, nombre de una letra, proveedor desconocido, id corto y sin responsable
const worst: Task[] = [
  base(11, { title: 'Nude_Tennis_Racket_🎾 with an extremely long name that runs right up to the server field limit and keeps going', state: 'integrando' }),
  base(12, { title: 'A', state: 'pendiente', assigneeRole: null, assigneeProvider: null }),
  base(13, { title: '模型动画角色の名前とアニメーション', state: 'revisando', assigneeProvider: 'proveedor-nuevo-sin-etiqueta' }),
  base(14, { title: 'Blocked task with a very long owner from the animation team', state: 'cerrando', blockedReason: 'x'.repeat(240), assigneeRole: 'animation and cinematics coordinator' }),
]

const tones: Tone[] = ['success', 'warning', 'error', 'info', 'neutral']
const swatches = [
  ['background', 'bg-background'], ['card', 'bg-card'], ['muted', 'bg-muted'], ['primary', 'bg-primary'], ['border', 'bg-border'],
  ['success', 'bg-success'], ['warning', 'bg-warning'], ['error', 'bg-error'], ['info', 'bg-info'], ['neutral', 'bg-neutral'],
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`h-${id}`} className="flex scroll-mt-6 flex-col gap-4">
      <h2 id={`h-${id}`} className="border-b border-subtle pb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}

/** Guía de estilo: todo lo que usa el panel, en todos sus estados. El conmutador «Peor caso» alimenta las filas con datos extremos (break-ui). */
export function Estilo() {
  const [data, setData] = useState<'normal' | 'peor'>('normal')
  const [count, setCount] = useState(12)
  const rows = data === 'normal' ? normal : [...normal.slice(0, 2), ...worst]
  return (
    <div className="grid grid-cols-[200px_minmax(0,var(--k-prose))] gap-10">
      <nav aria-label="Style guide sections" className="sticky top-6 flex h-fit flex-col gap-1 text-sm">
        <h2 className="mb-2 text-base font-semibold">Style guide</h2>
        {sections.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-md px-2 py-1 text-muted-foreground transition-colors duration-(--k-dur-micro) hover:text-foreground">{label}</a>)}
      </nav>

      <div className="flex min-w-0 flex-col gap-12 pb-24">
        <Section id="glifos" title="Glyphs">
          <GlyphLegend />
        </Section>

        <Section id="arte" title="Art">
          <ArtGallery />
        </Section>

        <Section id="colores" title="Colors">
          <ul className="grid grid-cols-5 gap-3">
            {swatches.map(([name, cls]) => (
              <li key={name} className="flex flex-col gap-2 text-xs">
                <span aria-hidden className={`h-12 rounded-md border border-subtle ${cls}`} />
                <span className="font-mono text-muted-foreground">{name}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="tipografia" title="Type">
          <p className="text-2xl font-semibold tracking-tight">Heading · View title</p>
          <p className="text-base">Body · Paragraph text meant to be read at leisure.</p>
          <p className="text-sm text-muted-foreground">Body · Secondary and supporting text.</p>
          <p className="font-mono text-sm">Mono · 3f9a1c2 · /Game/Maps/Plaza · 1,284</p>
        </Section>

        <Section id="estado" title="Status dots">
          <ul className="flex flex-wrap gap-6 text-sm">
            {tones.map((t) => <li key={t} className="flex items-center gap-2"><StatusDot tone={t} />{t}</li>)}
            <li className="flex items-center gap-2"><StatusDot tone="neutral" pulse />awaiting confirmation</li>
          </ul>
          <p className="text-xs text-muted-foreground">Color always comes with text: a state is never told apart by the dot alone.</p>
        </Section>

        <Section id="botones" title="Buttons and fields">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="outline">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
            <Button aria-busy disabled>Sending…</Button>
          </div>
          <div className="flex max-w-md flex-col gap-3">
            <Input placeholder="Normal field" aria-label="Normal field" />
            <Input placeholder="Field with error" aria-label="Field with error" aria-invalid defaultValue="Invalid value" />
            <p role="alert" className="text-xs text-error">The error is written next to the control that caused it.</p>
          </div>
        </Section>

        <Section id="filas" title="Production rows">
          <ToggleGroup aria-label="Sample data" value={[data]} onValueChange={(v) => setData((v[0] as 'normal' | 'peor' | undefined) ?? 'normal')} variant="outline" size="sm" spacing={0}>
            <ToggleGroupItem value="normal">Normal data</ToggleGroupItem>
            <ToggleGroupItem value="peor">Worst case</ToggleGroupItem>
          </ToggleGroup>
          <ul className="overflow-hidden rounded-lg border border-subtle">
            {rows.map((t) => <li key={t.id}><TaskRow task={t} now={Date.now()} open={false} onOpen={() => undefined} /></li>)}
            <li><TaskRow task={base(20, { id: 'tmp-estilo', title: 'Request just sent', state: 'pendiente', assigneeRole: null, assigneeProvider: null })} now={Date.now()} open={false} onOpen={() => undefined} /></li>
          </ul>
        </Section>

        <Section id="etapas" title="Task stage">
          <StageStepper task={{ state: 'revisando', blockedReason: null, decisionId: null }} />
          <StageStepper task={{ state: 'implementando', blockedReason: 'Texture pack missing.', decisionId: null }} />
          <StageStepper task={{ state: 'preparada', blockedReason: 'Choose between two candidates.', decisionId: 'd' }} />
        </Section>

        <Section id="movimiento" title="Motion">
          <ul className="grid grid-cols-4 gap-3 text-sm">
            {Object.entries(durations).map(([name, ms]) => (
              <li key={name} className="flex flex-col gap-1 rounded-lg border border-subtle p-3"><span className="font-mono">{ms} ms</span><span className="text-xs text-muted-foreground">{name}</span></li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">View and detail changes: View Transitions with a shared element. With reduced motion, 80 ms fades and no movement.</p>
        </Section>

        <Section id="cifras" title="Numbers">
          <div className="flex items-center gap-4">
            <Tick value={count} className="text-4xl font-medium" />
            <Button variant="outline" size="sm" onClick={() => setCount((n) => n + 1)}>Add one</Button>
          </div>
          <div className="grid max-w-3xl grid-cols-2 gap-4">
            <Meter name="With limit" unit="credits" spent={60} limit={100} />
            <Meter name="Used up" unit="credits" spent={100} limit={100} />
            <Meter name="No limit" unit="credits" spent={12} limit={null} />
          </div>
        </Section>

        <Section id="vacios" title="Empty and loading">
          <div className="rounded-lg border border-subtle"><EmptyState view="entregas" /></div>
          <div className="overflow-hidden rounded-lg border border-subtle"><RowsSkeleton rows={3} /></div>
          <div className="rounded-lg border border-subtle"><SheetSkeleton /></div>
        </Section>

        <Section id="avisos" title="Toasts">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" onClick={() => toasts.success({ title: 'Request sent', description: "It's outside the active filters.", action: { label: 'View', onClick: () => undefined } })}>Success with “View”</Button>
            <Button variant="outline" size="sm" onClick={() => toasts.error({ title: "Couldn't complete the action", description: 'No connection to the service.', action: { label: 'Retry', onClick: () => undefined } })}>Error with “Retry”</Button>
            <Button variant="outline" size="sm" onClick={() => toasts.error({ title: 'This decision is out of date', description: 'It changed while you were looking at it.', action: { label: 'Reload decision', onClick: () => undefined } })}>Expired decision</Button>
            <Button variant="outline" size="sm" onClick={() => toasts.info({ title: `${BRAND.short} is handling 3 messages` })}>Info</Button>
          </div>
        </Section>
      </div>
    </div>
  )
}
