import { useNavigate } from 'react-router'
import { humanError } from '@/lib/errors'
import { EmptyState as VisualEmpty } from '@/visual/art/EmptyState'
import { Glyph } from '@/visual/Glyph'
import { GlbViewer } from '@/components/GlbViewer'
import { useAssetViewer, viewerType, ViewerButton, type ViewerItem } from '@/components/AssetViewer'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { animateUpdate, withViewTransition } from '@/feel/transitions'
import { useAuthedSrc } from '@/hooks/artifact'
import { useAfter } from '@/hooks/time'
import { useParam } from '@/hooks/useParam'
import { useResource } from '@/hooks/useResource'
import { artifactName } from '@/lib/artifactName'
import { deliveryType, deliveryTypeLabel, deliveryTypes, duration, setCaption, taskSections, viewerName, viewLabel, type TaskSection, type VisualSet } from '@/lib/deliveries'
import type { Artifact } from '@/lib/tasks'
import { useStore } from '@/store'
import { MeshyExpired, meshyExpired } from './MeshyExpired'
import { ReportsRow } from './EntregasInformes'

const file = (a: Artifact) => `/artifacts/${encodeURIComponent(a.id)}/file`
const prov = (a: Artifact) => (a.provenance ?? {}) as Record<string, unknown>
const grid = 'grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4'
const orders = { tarea: 'Por tarea', recientes: 'Más recientes' } as const

/** Lo que dice el visor bajo el título: tarea, resolución, mapa y licencia; nunca archivos ni rutas. */
const meta = (a: Artifact, task: string) => [task, String(prov(a).resolution ?? '').replace('x', '×'), String(prov(a).map ?? '').split('/').pop(),
  a.license ? `Licencia: ${a.license}` : ''].filter(Boolean) as string[]

function viewerItems(sections: TaskSection[], title: (id: string) => string): ViewerItem[] {
  const one = (a: Artifact, set?: VisualSet): ViewerItem => ({ id: a.id, name: viewerName(a), meta: meta(a, title(a.taskId)),
    type: meshyExpired(a) ? 'other' : viewerType(a.path), path: file(a), modelId: a.id,
    group: set && set.items.length > 1 ? set.key : undefined, angle: viewLabel(a),
    fallback: meshyExpired(a) ? <MeshyExpired a={a} /> : <Glyph kind="artifact" value={a.kind} size={96} /> })
  return sections.flatMap((s) => [...s.visuals.flatMap((set) => set.items.map((a) => one(a, set))), ...s.models.map((a) => one(a))])
}

/** Portada 16:9: la hoja de contactos, la vista del jugador o el fotograma del vídeo con su duración. */
function Cover({ set, caption }: { set: VisualSet; caption: string }) {
  const a = set.cover, video = a.kind === 'video'
  const src = useAuthedSrc(video ? (a.previewPath ? `/artifacts/${encodeURIComponent(a.id)}/preview` : null) : file(a))
  const length = video ? duration(prov(a).seconds) : null
  return <div className="relative size-full">
    {src ? <img src={src} alt={caption} width={480} height={270} className="size-full object-cover" loading="lazy" />
      : <span className="grid size-full place-items-center text-muted-foreground"><Glyph kind="artifact" value={a.kind} size={48} /></span>}
    {video && src && <span className="absolute inset-0 grid place-items-center"><span className="rounded-full bg-background/80 p-2"><Glyph kind="artifact" value="video" size={24} /></span></span>}
    {length && <span className="absolute right-2 bottom-2 rounded-sm bg-background/80 px-1.5 font-mono text-xs tabular-nums">{length}</span>}
  </div>
}

function Card({ caption, onOpen, children }: { caption: string; onOpen: (el: HTMLElement) => void; children: React.ReactNode }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-subtle bg-background transition-colors duration-(--k-dur-micro) hover:border-strong">
      <div className="aspect-video overflow-hidden border-b border-subtle bg-card"><ViewerButton name={caption} onOpen={onOpen}>{children}</ViewerButton></div>
      <p className="truncate px-3 py-2 text-sm">{caption}</p>
    </li>
  )
}

function Section({ s, open }: { s: TaskSection; open: (id: string, el: HTMLElement) => void }) {
  return (
    <section aria-label={s.title} className="flex flex-col gap-3">
      <h2 className="truncate text-sm font-medium">{s.title}</h2>
      {s.visuals.length > 0 && <ul data-part="visuales" aria-label="Capturas y vídeos" className={grid}>
        {s.visuals.map((set) => {
          const caption = setCaption(set)
          return <Card key={set.key} caption={caption} onOpen={(el) => open(set.items[0].id, el)}><Cover set={set} caption={caption} /></Card>
        })}
      </ul>}
      {s.models.length > 0 && <ul data-part="modelos" aria-label="Modelos" className={grid}>
        {s.models.map((a) => <Card key={a.id} caption={artifactName(a)} onOpen={(el) => open(a.id, el)}>
          {meshyExpired(a) ? <MeshyExpired a={a} /> : <GlbViewer id={a.id} name={artifactName(a)} />}
        </Card>)}
      </ul>}
      {s.reports.length > 0 && <ReportsRow items={s.reports} />}
    </section>
  )
}

/** «Más recientes»: una sola sección con todo, lo visual primero. */
const flat = (sections: TaskSection[]): TaskSection[] => sections.length ? [{ taskId: '', title: 'Más recientes', newest: sections[0].newest,
  visuals: sections.flatMap((s) => s.visuals).sort((a, b) => b.cover.createdAt.localeCompare(a.cover.createdAt)),
  models: sections.flatMap((s) => s.models), reports: sections.flatMap((s) => s.reports) }] : []

export function Entregas() {
  const { data, loading, error } = useResource<Artifact[]>('/artifacts', /^artifact\./)
  const tasks = useStore((s) => s.tasks)
  const navigate = useNavigate()
  const slow = useAfter(loading)
  const [type, setType] = useParam('tipo')
  const [orderParam, setOrder] = useParam('orden', 'tarea')
  const order = orderParam === 'recientes' ? 'recientes' : 'tarea'
  const title = (id: string) => tasks.find((t) => t.id === id)?.title ?? 'Tarea sin título'
  const shown = (data ?? []).filter((a) => !type || deliveryType(a) === type)
  const byTask = taskSections(shown, title)
  const sections = order === 'tarea' ? byTask : flat(byTask)
  const { open, viewer } = useAssetViewer(viewerItems(sections, title))

  if (error && !data) return <p role="alert" className="text-sm text-error">No se pudieron cargar las entregas. {humanError(new Error(error))}</p>
  if (loading) return slow ? <div className={grid} role="status" aria-label="Cargando las entregas">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-video" />)}</div> : null
  if (!data?.length) {
    return <VisualEmpty view="entregas" message="Aún no hay entregas" action={{ label: 'Nueva petición', onClick: () => void withViewTransition(() => navigate('/?nueva=1', { flushSync: true })) }} />
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup aria-label="Filtrar por tipo" value={[type || 'todos']} variant="outline" size="sm" spacing={0}
          onValueChange={(v) => void animateUpdate(() => setType(v[0] === 'todos' ? '' : v[0] ?? ''))}>
          <ToggleGroupItem value="todos">Todos</ToggleGroupItem>
          {deliveryTypes.map((t) => <ToggleGroupItem key={t} value={t}>{deliveryTypeLabel[t]}</ToggleGroupItem>)}
        </ToggleGroup>
        <select aria-label="Ordenar entregas" value={order} onChange={(e) => void animateUpdate(() => setOrder(e.target.value))}
          className="ml-auto h-8 rounded-md border border-subtle bg-background px-2 text-sm">
          {Object.entries(orders).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {shown.length === 0 && <p className="text-sm text-muted-foreground">Ninguna entrega de este tipo.</p>}
      {sections.map((s) => <Section key={s.taskId || 'todas'} s={s} open={open} />)}
      {viewer}
    </div>
  )
}
