import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { humanError } from '@/lib/errors'
import { EmptyState as VisualEmpty } from '@/visual/art/EmptyState'
import { Glyph } from '@/visual/Glyph'
import { GlbViewer } from '@/components/GlbViewer'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { animateUpdate, withViewTransition } from '@/feel/transitions'
import { useArtifactSrc } from '@/hooks/artifact'
import { useAfter } from '@/hooks/time'
import { useParam } from '@/hooks/useParam'
import { useResource } from '@/hooks/useResource'
import { artifactName, artifactType, artifactTypeLabel, artifactTypes, errorLines, fileName, groupArtifacts, isBuildLog, orderLabel, orders, type Order } from '@/lib/artifactName'
import type { Artifact } from '@/lib/tasks'
import { useStore } from '@/store'
import { MeshyExpired, meshyExpired } from './MeshyExpired'

const isImage = (a: Artifact) => /\.(png|jpe?g|webp)$/i.test(a.path)
const isModel = (a: Artifact) => /\.(glb|gltf)$/i.test(a.path)

/** Las dos primeras líneas con «error» de un registro de compilación, leídas del propio log. */
function useErrorLines(a: Artifact): string[] {
  const src = useArtifactSrc(a.id)
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    if (!src || !isBuildLog(a)) return
    let alive = true
    fetch(src).then((r) => r.ok ? r.text() : '').then((text) => { if (alive) setLines(errorLines(text)) }, () => {})
    return () => { alive = false }
  }, [src, a])
  return lines
}

function Preview({ a, name }: { a: Artifact; name: string }) {
  const src = useArtifactSrc(a.id)
  const errors = useErrorLines(a)
  if (meshyExpired(a)) return <MeshyExpired a={a} />
  if (isModel(a)) return <GlbViewer id={a.id} name={fileName(a)} />
  if (isImage(a) && src) return <img src={src} alt={name} width={400} height={300} className="size-full object-cover" loading="lazy" />
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-3 text-muted-foreground">
      <Glyph kind="artifact" value={a.kind} size={48} />
      {errors.length > 0 && <pre aria-label="Primeros errores" className="w-full overflow-hidden font-mono text-[11px] leading-4 whitespace-pre-wrap text-error">{errors.join('\n')}</pre>}
    </div>
  )
}

function Card({ a, task }: { a: Artifact; task: string }) {
  const name = artifactName(a)
  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-subtle bg-background transition-colors duration-(--k-dur-micro) hover:border-strong"
      title={[fileName(a), a.path, task, a.license].filter(Boolean).join('\n')}>
      <div className="aspect-[4/3] overflow-hidden border-b border-subtle bg-card"><Preview a={a} name={name} /></div>
      <p className="truncate p-3 text-sm">{name}</p>
    </li>
  )
}

export function Entregas() {
  const { data, loading, error } = useResource<Artifact[]>('/artifacts', /^artifact\./)
  const tasks = useStore((s) => s.tasks)
  const navigate = useNavigate()
  const slow = useAfter(loading)
  const [type, setType] = useParam('tipo')
  const [orderParam, setOrder] = useParam('orden', 'recientes')
  const order = (orders as readonly string[]).includes(orderParam) ? orderParam as Order : 'recientes'

  if (error && !data) return <p role="alert" className="text-sm text-error">No se pudieron cargar las entregas. {humanError(new Error(error))}</p>
  if (loading) return slow ? <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4" role="status" aria-label="Cargando las entregas">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-56" />)}</div> : null
  if (!data?.length) {
    return <VisualEmpty view="entregas" message="Aún no hay entregas" action={{ label: 'Nueva petición', onClick: () => void withViewTransition(() => navigate('/?nueva=1', { flushSync: true })) }} />
  }
  const title = (id: string) => tasks.find((t) => t.id === id)?.title ?? id.slice(0, 8)
  const shown = data.filter((a) => !type || artifactType(a) === type)
  const groups = groupArtifacts(shown, order, title)
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup aria-label="Filtrar por tipo" value={[type || 'todos']} variant="outline" size="sm" spacing={0}
          onValueChange={(v) => void animateUpdate(() => setType(v[0] === 'todos' ? '' : v[0] ?? ''))}>
          <ToggleGroupItem value="todos">Todos</ToggleGroupItem>
          {artifactTypes.map((t) => <ToggleGroupItem key={t} value={t}>{artifactTypeLabel[t]}</ToggleGroupItem>)}
        </ToggleGroup>
        <select aria-label="Ordenar entregas" value={order} onChange={(e) => void animateUpdate(() => setOrder(e.target.value))}
          className="ml-auto h-8 rounded-md border border-subtle bg-background px-2 text-sm">
          {orders.map((o) => <option key={o} value={o}>{orderLabel[o]}</option>)}
        </select>
      </div>
      {shown.length === 0 && <p className="text-sm text-muted-foreground">Ninguna entrega de este tipo.</p>}
      {groups.map((g) => (
        <section key={g.key} aria-label={g.title ?? 'Más recientes'} className="flex flex-col gap-3">
          {g.title && <h2 className="truncate text-sm font-medium">{g.title}</h2>}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {g.items.map((a) => <Card key={a.id} a={a} task={title(a.taskId)} />)}
          </ul>
        </section>
      ))}
    </div>
  )
}
