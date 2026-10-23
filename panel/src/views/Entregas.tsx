import { useNavigate } from 'react-router'
import { humanError } from '@/lib/errors'
import { EmptyState as VisualEmpty } from '@/visual/art/EmptyState'
import { Glyph } from '@/visual/Glyph'
import { GlbViewer } from '@/components/GlbViewer'
import { Skeleton } from '@/components/ui/skeleton'
import { withViewTransition } from '@/feel/transitions'
import { useArtifactSrc } from '@/hooks/artifact'
import { useAfter } from '@/hooks/time'
import { useResource } from '@/hooks/useResource'
import type { Artifact } from '@/lib/tasks'
import { useStore } from '@/store'

const kindLabel: Record<string, string> = { model: 'Modelo', texture: 'Textura', screenshot: 'Captura', video: 'Vídeo', build: 'Compilación', report: 'Informe', diff: 'Cambios' }
const isImage = (a: Artifact) => /\.(png|jpe?g|webp)$/i.test(a.path)
const isModel = (a: Artifact) => /\.(glb|gltf)$/i.test(a.path)

function Preview({ a }: { a: Artifact }) {
  const src = useArtifactSrc(a.id)
  const name = a.path.split('/').pop() ?? a.path
  if (isModel(a)) return <GlbViewer id={a.id} name={name} />
  if (isImage(a) && src) return <img src={src} alt={name} width={400} height={300} className="size-full object-cover" loading="lazy" />
  return <div className="grid size-full place-items-center text-muted-foreground"><Glyph kind="artifact" value={a.kind} size={48} /></div>
}

export function Entregas() {
  const { data, loading, error } = useResource<Artifact[]>('/artifacts', /^artifact\./)
  const tasks = useStore((s) => s.tasks)
  const navigate = useNavigate()
  const slow = useAfter(loading)

  if (error && !data) return <p role="alert" className="text-sm text-error">No se pudieron cargar las entregas. {humanError(new Error(error))}</p>
  if (loading) return slow ? <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4" role="status" aria-label="Cargando las entregas">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-56" />)}</div> : null
  if (!data?.length) {
    return <VisualEmpty view="entregas" message="Aún no hay entregas" action={{ label: 'Nueva petición', onClick: () => void withViewTransition(() => navigate('/?nueva=1', { flushSync: true })) }} />
  }
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
      {[...data].reverse().map((a) => {
        const task = tasks.find((t) => t.id === a.taskId)
        const name = a.path.split('/').pop() ?? a.path
        return (
          <li key={a.id} className="flex flex-col overflow-hidden rounded-lg border border-subtle bg-background transition-colors duration-(--k-dur-micro) hover:border-strong">
            <div className="aspect-[4/3] overflow-hidden border-b border-subtle bg-card"><Preview a={a} /></div>
            <div className="flex flex-col gap-1 p-3 text-sm">
              <span className="truncate font-mono text-xs" title={a.path}>{name}</span>
              <span className="text-xs text-muted-foreground">{kindLabel[a.kind] ?? a.kind}{a.license ? ` · ${a.license}` : ''}</span>
              {task && <span className="truncate text-xs text-muted-foreground">{task.title}</span>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
