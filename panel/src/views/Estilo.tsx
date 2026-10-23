import { useState } from 'react'
import { EmptyState } from '@/components/EmptyState'
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

const sections = [
  ['glifos', 'Glifos'],
  ['colores', 'Colores'], ['tipografia', 'Tipografía'], ['estado', 'Puntos de estado'], ['botones', 'Botones y campos'],
  ['filas', 'Filas de producción'], ['etapas', 'Etapa de la tarea'], ['movimiento', 'Movimiento'], ['cifras', 'Cifras'],
  ['vacios', 'Vacíos y esqueletos'], ['avisos', 'Avisos'],
] as const

const base = (n: number, over: Partial<Task>): Task => ({
  id: `estilo-${n}000000`, createdAt: '2026-10-23T10:00:00.000Z', updatedAt: new Date(Date.now() - n * 7 * 60_000).toISOString(),
  title: `Tarea de ejemplo ${n}`, spec: '', acceptance: [], state: 'implementando', blockedReason: null, decisionId: null, area: 'gameplay',
  assigneeRole: 'desarrollador', assigneeProvider: 'codex', parentTaskId: null, dependsOn: [], worktreeId: null, budgetId: null, ...over,
})

const normal: Task[] = [
  base(1, { state: 'pendiente', title: 'Definir salto', assigneeRole: null, assigneeProvider: null }),
  base(2, { state: 'implementando', title: 'Habilidad Meteorito' }),
  base(3, { state: 'revisando', title: 'Revisar combate', assigneeProvider: 'claude' }),
  base(4, { state: 'implementando', title: 'Elegir personaje base', decisionId: 'd', blockedReason: 'Elegir entre dos candidatos.' }),
  base(5, { state: 'probando', title: 'Probar recorrido', blockedReason: 'Falta el pack de texturas.' }),
  base(6, { state: 'cerrando', title: 'Retirar espacio de trabajo', blockedReason: 'Quedó un espacio de trabajo sin retirar.' }),
  base(7, { state: 'done', title: 'Publicar informe' }),
]

// peor caso realista: nombre largo con emoji, nombre de una letra, proveedor desconocido, id corto y sin responsable
const worst: Task[] = [
  base(11, { title: 'Nude_Tennis_Racket_🎾 con un nombre larguísimo que llega hasta el límite del campo del servidor y sigue', state: 'integrando' }),
  base(12, { title: 'A', state: 'pendiente', assigneeRole: null, assigneeProvider: null }),
  base(13, { title: '模型动画角色の名前とアニメーション', state: 'revisando', assigneeProvider: 'proveedor-nuevo-sin-etiqueta' }),
  base(14, { title: 'Tarea con bloqueo y responsable muy largo del equipo de animación', state: 'cerrando', blockedReason: 'x'.repeat(240), assigneeRole: 'coordinador de animación y cinemáticas' }),
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
    <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-10">
      <nav aria-label="Secciones de la guía" className="sticky top-6 flex h-fit flex-col gap-1 text-sm">
        <h2 className="mb-2 text-base font-semibold">Guía de estilo</h2>
        {sections.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-md px-2 py-1 text-muted-foreground transition-colors duration-(--k-dur-micro) hover:text-foreground">{label}</a>)}
      </nav>

      <div className="flex min-w-0 flex-col gap-12 pb-24">
        <Section id="glifos" title="Glifos">
          <GlyphLegend />
        </Section>

        <Section id="colores" title="Colores">
          <ul className="grid grid-cols-5 gap-3">
            {swatches.map(([name, cls]) => (
              <li key={name} className="flex flex-col gap-2 text-xs">
                <span aria-hidden className={`h-12 rounded-md border border-subtle ${cls}`} />
                <span className="font-mono text-muted-foreground">{name}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="tipografia" title="Tipografía">
          <p className="text-2xl font-semibold tracking-tight">Geist Sans · Título de vista</p>
          <p className="text-base">Geist Sans · Texto de párrafo para leer con calma.</p>
          <p className="text-sm text-muted-foreground">Geist Sans · Texto secundario y apoyo.</p>
          <p className="font-mono text-sm">Geist Mono · 3f9a1c2 · /Game/Maps/Plaza · 1.284</p>
        </Section>

        <Section id="estado" title="Puntos de estado">
          <ul className="flex flex-wrap gap-6 text-sm">
            {tones.map((t) => <li key={t} className="flex items-center gap-2"><StatusDot tone={t} />{t}</li>)}
            <li className="flex items-center gap-2"><StatusDot tone="neutral" pulse />pendiente de confirmar</li>
          </ul>
          <p className="text-xs text-muted-foreground">El color siempre va con un texto: nunca se distingue un estado solo por el punto.</p>
        </Section>

        <Section id="botones" title="Botones y campos">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primario</Button>
            <Button variant="outline">Secundario</Button>
            <Button variant="ghost">Fantasma</Button>
            <Button variant="destructive">Destructivo</Button>
            <Button disabled>Desactivado</Button>
            <Button aria-busy disabled>Enviando…</Button>
          </div>
          <div className="flex max-w-md flex-col gap-3">
            <Input placeholder="Campo normal" aria-label="Campo normal" />
            <Input placeholder="Campo con error" aria-label="Campo con error" aria-invalid defaultValue="Valor no válido" />
            <p role="alert" className="text-xs text-error">El error se escribe junto al control que lo causó.</p>
          </div>
        </Section>

        <Section id="filas" title="Filas de producción">
          <ToggleGroup aria-label="Datos de ejemplo" value={[data]} onValueChange={(v) => setData((v[0] as 'normal' | 'peor' | undefined) ?? 'normal')} variant="outline" size="sm" spacing={0}>
            <ToggleGroupItem value="normal">Datos normales</ToggleGroupItem>
            <ToggleGroupItem value="peor">Peor caso</ToggleGroupItem>
          </ToggleGroup>
          <ul className="overflow-hidden rounded-lg border border-subtle">
            {rows.map((t) => <li key={t.id}><TaskRow task={t} now={Date.now()} open={false} onOpen={() => undefined} /></li>)}
            <li><TaskRow task={base(20, { id: 'tmp-estilo', title: 'Petición recién enviada', state: 'pendiente', assigneeRole: null, assigneeProvider: null })} now={Date.now()} open={false} onOpen={() => undefined} /></li>
          </ul>
        </Section>

        <Section id="etapas" title="Etapa de la tarea">
          <StageStepper task={{ state: 'revisando', blockedReason: null, decisionId: null }} />
          <StageStepper task={{ state: 'implementando', blockedReason: 'Falta el pack de texturas.', decisionId: null }} />
          <StageStepper task={{ state: 'preparada', blockedReason: 'Elegir entre dos candidatos.', decisionId: 'd' }} />
        </Section>

        <Section id="movimiento" title="Movimiento">
          <ul className="grid grid-cols-4 gap-3 text-sm">
            {Object.entries(durations).map(([name, ms]) => (
              <li key={name} className="flex flex-col gap-1 rounded-lg border border-subtle p-3"><span className="font-mono">{ms} ms</span><span className="text-xs text-muted-foreground">{name}</span></li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Cambio de vista y detalle: View Transitions con elemento compartido. Con «reducir movimiento», fundidos de 80 ms sin desplazamiento.</p>
        </Section>

        <Section id="cifras" title="Cifras">
          <div className="flex items-center gap-4">
            <Tick value={count} className="text-4xl font-medium" />
            <Button variant="outline" size="sm" onClick={() => setCount((n) => n + 1)}>Sumar uno</Button>
          </div>
          <div className="grid max-w-3xl grid-cols-2 gap-4">
            <Meter name="Con límite" unit="créditos" spent={60} limit={100} />
            <Meter name="Agotado" unit="créditos" spent={100} limit={100} />
            <Meter name="Sin límite" unit="créditos" spent={12} limit={null} />
          </div>
        </Section>

        <Section id="vacios" title="Vacíos y esqueletos">
          <div className="rounded-lg border border-subtle"><EmptyState title="Aún no hay entregas" hint="Los modelos y capturas aparecerán aquí." action={{ label: 'Nueva petición', onClick: () => undefined }} /></div>
          <div className="overflow-hidden rounded-lg border border-subtle"><RowsSkeleton rows={3} /></div>
          <div className="rounded-lg border border-subtle"><SheetSkeleton /></div>
        </Section>

        <Section id="avisos" title="Avisos">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" onClick={() => toasts.success({ title: 'Petición enviada', description: 'Está fuera de los filtros activos.', action: { label: 'Ver', onClick: () => undefined } })}>Éxito con «Ver»</Button>
            <Button variant="outline" size="sm" onClick={() => toasts.error({ title: 'No se pudo completar la acción', description: 'Sin conexión con el servicio.', action: { label: 'Reintentar', onClick: () => undefined } })}>Error con «Reintentar»</Button>
            <Button variant="outline" size="sm" onClick={() => toasts.error({ title: 'Esta decisión ya no está vigente', description: 'Cambió mientras la mirabas.', action: { label: 'Recargar decisión', onClick: () => undefined } })}>Decisión caducada</Button>
            <Button variant="outline" size="sm" onClick={() => toasts.info({ title: 'Kratos está atendiendo 3 mensajes' })}>Información</Button>
          </div>
        </Section>
      </div>
    </div>
  )
}
