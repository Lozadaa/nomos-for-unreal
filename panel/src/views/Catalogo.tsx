import { useMemo, useState } from 'react'
import { humanError } from '@/lib/errors'
import { api, ApiError } from '@/api'
import { EmptyState } from '@/components/EmptyState'
import { StatusDot } from '@/components/StatusDot'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { animateUpdate } from '@/feel/transitions'
import { useAction } from '@/feel/useAction'
import { useAfter } from '@/hooks/time'
import { useParam } from '@/hooks/useParam'
import { useResource } from '@/hooks/useResource'
import { cn } from '@/lib/utils'

export interface CatalogEntry {
  id: string; name: string; category: string; description: string; source: string
  state: 'owned' | 'downloaded' | 'cached' | 'imported'; projects: string[]; formats: string[]; engineVersions: string[]
  license: string | null; aiForbidden: 0 | 1; tags: string[]
}

const sourceLabel: Record<string, string> = {
  fab: 'Fab', megascans: 'Megascans', polyhaven: 'Poly Haven', ambientcg: 'ambientCG', kenney: 'Kenney',
  quaternius: 'Quaternius', sketchfab: 'Sketchfab', freesound: 'Freesound', meshy: 'Meshy', blender: 'Blender',
}

type Mode = 'todos' | 'usables' | 'instalados'

function Card({ entry }: { entry: CatalogEntry }) {
  const [note, setNote] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const prepare = useAction(
    () => api('/commands', { method: 'POST', body: { type: 'catalog.prepare', payload: { entryId: entry.id }, idempotencyKey: `prepare:${entry.id}` } }),
    {
      optimistic: () => { setPreparing(true); setNote(null); return () => setPreparing(false) },
      // la bandeja de comandos aún no acepta órdenes del panel (llega con el ejecutor): se dice en la tarjeta, no como fallo genérico
      error: (e) => {
        if (e instanceof ApiError && e.status === 404) setNote('Disponible cuando el ejecutor de comandos esté listo.')
        return { title: 'Todavía no se puede preparar', description: 'El servicio aún no acepta esta orden.' }
      },
      success: () => ({ title: `${entry.name} se está preparando`, description: 'Aparecerá en el proyecto cuando termine.' }),
    },
  )
  const forbidden = entry.aiForbidden === 1
  const unknown = !entry.license
  const installed = entry.state === 'imported'
  return (
    <li className={cn('flex flex-col gap-3 rounded-lg border border-subtle p-4 transition-colors duration-(--k-dur-micro) hover:border-strong', forbidden && 'opacity-80')}>
      <div className="flex flex-col gap-1">
        <h3 className="truncate text-sm font-medium" title={entry.name}>{entry.name}</h3>
        <p className="truncate text-xs text-muted-foreground">
          {sourceLabel[entry.source] ?? entry.source}{entry.engineVersions[0] ? ` · UE ${entry.engineVersions[0]}` : ''}{entry.formats.length ? ` · ${entry.formats.join(', ')}` : ''}
        </p>
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">{entry.description}</p>
      <div className="mt-auto flex flex-col gap-2">
        {forbidden ? (
          <p className="text-xs font-medium text-error">Prohibido para IA · no se puede usar con agentes</p>
        ) : unknown ? (
          <p className="flex items-center gap-2 text-xs"><StatusDot tone="warning" />Licencia desconocida</p>
        ) : installed ? (
          <p className="flex items-center gap-2 text-xs"><StatusDot tone="success" />Instalado en {entry.projects[0] ?? 'el proyecto'}</p>
        ) : (
          <p className="truncate text-xs text-muted-foreground" title={entry.license ?? ''}>{entry.license}</p>
        )}
        {!forbidden && !installed && (
          <Button variant="outline" size="sm" disabled={prepare.pending || preparing} aria-busy={prepare.pending} onClick={() => void prepare.fire()}>
            {prepare.pending ? 'Preparando…' : unknown ? 'Revisar licencia' : 'Preparar para Unreal'}
          </Button>
        )}
        {note && <p role="status" className="text-xs text-muted-foreground">{note}</p>}
      </div>
    </li>
  )
}

export function Catalogo() {
  const { data, loading, error } = useResource<CatalogEntry[]>('/catalog')
  const slow = useAfter(loading)
  const [modeParam, setMode] = useParam('modo', 'todos')
  const mode = modeParam as Mode
  const [source, setSource] = useParam('origen')
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const shown = useMemo(() => (data ?? []).filter((e) =>
    (!source || e.source === source) &&
    (mode === 'todos' || (mode === 'usables' ? !e.aiForbidden && e.state !== 'imported' : e.state === 'imported')) &&
    (!q || `${e.name} ${e.description} ${e.tags.join(' ')}`.toLowerCase().includes(q))), [data, mode, source, q])
  const sources = useMemo(() => [...new Set((data ?? []).map((e) => e.source))], [data])
  const clear = () => void animateUpdate(async () => { setQuery(''); await setSource(''); await setMode('todos') })

  if (error && !data) return <p role="alert" className="text-sm text-error">No se pudo cargar el catálogo. {humanError(new Error(error))}</p>
  if (loading) return slow ? <div role="status" aria-label="Cargando el catálogo" className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40" />)}</div> : null
  if (!data?.length) return <EmptyState title="Aún no se ha indexado nada" hint="Kratos busca aquí antes de generar un asset nuevo." />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup aria-label="Filtrar el catálogo" value={[mode]} variant="outline" size="sm" spacing={0}
          onValueChange={(v) => void animateUpdate(() => setMode(v[0] ?? 'todos'))}>
          <ToggleGroupItem value="todos">Todos</ToggleGroupItem>
          <ToggleGroupItem value="usables">Usables con IA</ToggleGroupItem>
          <ToggleGroupItem value="instalados">Instalados</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup aria-label="Filtrar por origen" value={source ? [source] : []} variant="outline" size="sm" spacing={0}
          onValueChange={(v) => void animateUpdate(() => setSource(v[0] ?? ''))}>
          {sources.map((s) => <ToggleGroupItem key={s} value={s}>{sourceLabel[s] ?? s}</ToggleGroupItem>)}
        </ToggleGroup>
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar asset…" autoComplete="off" name="q" spellCheck={false} aria-label="Buscar asset" className="ml-auto h-8 w-56" />
      </div>
      {shown.length === 0
        ? <div className="rounded-lg border border-subtle"><EmptyState title="Ningún asset coincide con tu búsqueda" action={{ label: 'Quitar filtros', onClick: clear }} /></div>
        : <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">{shown.map((e) => <Card key={e.id} entry={e} />)}</ul>}
    </div>
  )
}
