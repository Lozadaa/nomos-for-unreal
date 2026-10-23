import { useId, useMemo, useState, type ComponentType, type SVGProps } from 'react'
import { useNavigate } from 'react-router'
import { humanError } from '@/lib/errors'
import { api, ApiError } from '@/api'
import { EmptyState } from '@/visual/art/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { animateUpdate, withViewTransition } from '@/feel/transitions'
import { useAction } from '@/feel/useAction'
import { useAfter } from '@/hooks/time'
import { useParam } from '@/hooks/useParam'
import { useResource } from '@/hooks/useResource'
import { useIndexCatalog } from '@/hooks/assetCommands'
import { cn } from '@/lib/utils'
import { catalogArea, catalogThumbnailUrl } from '@/lib/catalogVisual'
import { Glyph } from '@/visual/Glyph'
import { glyphFor } from '@/visual/glyphs'
import { AreaPictogram } from '@/visual/art/AreaPictogram'
import { budgets, countWords, truncateWords } from '@/visual/text-budget'

export interface CatalogEntry {
  id: string; name: string; category: string; description: string; source: string
  state: 'owned' | 'downloaded' | 'cached' | 'imported'; projects: string[]; formats: string[]; engineVersions: string[]
  license: string | null; aiForbidden: 0 | 1; tags: string[]
  thumbnailPath?: string | null; thumbnail_path?: string | null
}

const sourceLabel: Record<string, string> = {
  fab: 'Fab', megascans: 'Megascans', polyhaven: 'Poly Haven', ambientcg: 'ambientCG', kenney: 'Kenney',
  quaternius: 'Quaternius', sketchfab: 'Sketchfab', freesound: 'Freesound', meshy: 'Meshy', blender: 'Blender',
}

type Mode = 'todos' | 'usables' | 'instalados'

function StatusIcon({ value, label, tone }: { value: string; label: string; tone: 'warning' | 'error' | 'success' }) {
  const Icon = glyphFor('taskState', value).Icon as ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
  const colors = { warning: 'text-warning', error: 'text-error', success: 'text-success' }
  return <Icon size={16} role="img" aria-label={label} aria-hidden={undefined} className={`shrink-0 ${colors[tone]}`} />
}

function Preview({ entry }: { entry: CatalogEntry }) {
  const url = catalogThumbnailUrl(entry.thumbnailPath) ?? catalogThumbnailUrl(entry.thumbnail_path)
  const [failed, setFailed] = useState<string | null>(null)
  return <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-md border border-subtle bg-card">
    {url && failed !== url
      ? <img src={url} alt={entry.name} loading="lazy" width={400} height={300} className="size-full object-cover" onError={() => setFailed(url)} />
      : <AreaPictogram area={catalogArea(entry.category)} />}
  </div>
}

export function CatalogCard({ entry }: { entry: CatalogEntry }) {
  const [note, setNote] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [actionDetails, setActionDetails] = useState(false)
  const metadataId = useId()
  const actionHintId = useId()
  const prepare = useAction(
    () => api('/commands', { method: 'POST', body: { type: 'catalog.prepare', payload: { entryId: entry.id }, idempotencyKey: `prepare:${entry.id}` } }),
    {
      optimistic: () => { setNote(null); setActionDetails(false); return () => {} },
      // la bandeja de comandos aún no acepta órdenes del panel (llega con el ejecutor): se dice en la tarjeta, no como fallo genérico
      error: (e) => {
        const message = e instanceof ApiError && e.status === 404 ? 'Disponible cuando el ejecutor de comandos esté listo.' : humanError(e)
        setNote(message)
        setActionDetails(true)
        return { title: 'Todavía no se puede preparar', description: message }
      },
      success: () => { setAccepted(true); return { title: `${entry.name} se está preparando`, description: 'Aparecerá en el proyecto cuando termine.' } },
    },
  )
  const forbidden = entry.aiForbidden === 1
  const unknown = !entry.license
  const installed = entry.state === 'imported'
  const source = sourceLabel[entry.source] ?? entry.source
  const forbiddenMessage = 'Prohibido para IA · no se puede usar con agentes'
  const forbiddenLabel = countWords(source) > 1 ? 'No IA' : 'Prohibido para IA'
  const actionLabel = prepare.pending ? 'Preparando…' : accepted ? 'Pendiente' : note ? 'Reintentar' : 'Preparar'
  const actionWords = forbidden ? countWords(forbiddenLabel) : installed ? 1 : unknown ? 2 : 1
  const title = truncateWords(entry.name, Math.max(1, budgets.catalogCard - countWords(source) - actionWords))
  const project = `Instalado en ${entry.projects[0] ?? 'el proyecto'}`
  const actionHint = note ?? (accepted ? 'Preparación solicitada. Aparecerá en el proyecto cuando termine.' : `Preparar ${entry.name} para Unreal. Licencia: ${entry.license ?? 'desconocida'}.`)
  return (
    <li data-catalog-card={entry.id} className={cn('flex flex-col gap-3 rounded-lg border border-subtle p-4 transition-colors duration-(--k-dur-micro) hover:border-strong', forbidden && 'opacity-80')}>
      <Preview entry={entry} />
      <div className="flex flex-col items-start gap-2">
        <Tooltip>
          <TooltipTrigger render={<h3 tabIndex={0} aria-label={entry.name} aria-describedby={metadataId} title={entry.name} className="max-w-full truncate text-sm font-medium outline-offset-2" />}>{title}</TooltipTrigger>
          <TooltipContent role="tooltip" id={metadataId}><div className="grid gap-1">
            <p>{entry.name}</p><p>{entry.description}</p>
            <p>{entry.engineVersions.length ? `UE ${entry.engineVersions.join(', ')} · ` : ''}{entry.formats.join(', ')}</p>
            <p>{entry.license ? `Licencia: ${entry.license}` : 'Licencia desconocida'}</p>
            {installed && <p>{project}</p>}
          </div></TooltipContent>
        </Tooltip>
        <Glyph kind="source" value={entry.source} />
      </div>
      <div className="mt-auto flex flex-col gap-2">
        {forbidden ? (
          <Tooltip><TooltipTrigger render={<span tabIndex={0} aria-label={forbiddenMessage} title={forbiddenMessage} className="inline-flex items-center gap-2 text-xs font-medium text-error outline-offset-2" />}>
            <StatusIcon value="bloqueada" label="Prohibido para IA" tone="error" />{forbiddenLabel}
          </TooltipTrigger><TooltipContent role="tooltip">{forbiddenMessage}</TooltipContent></Tooltip>
        ) : installed ? (
          <Tooltip><TooltipTrigger render={<span tabIndex={0} title={project} aria-label={project} className="inline-flex items-center gap-2 text-xs outline-offset-2" />}>
            <StatusIcon value="done" label="Instalado" tone="success" />Instalado
          </TooltipTrigger><TooltipContent role="tooltip">{project}</TooltipContent></Tooltip>
        ) : unknown ? (
          <Sheet><SheetTrigger render={<Button variant="outline" size="sm" aria-label="Revisar licencia" />}>
            <StatusIcon value="decision" label="Licencia desconocida" tone="warning" />Revisar licencia
          </SheetTrigger><SheetContent>
            <SheetHeader><SheetTitle>Revisar licencia</SheetTitle><SheetDescription>{entry.name}</SheetDescription></SheetHeader>
            <p className="px-4 text-sm text-muted-foreground">La licencia no está declarada. Búscala en el origen ({source}) antes de usar este asset con agentes.</p>
          </SheetContent></Sheet>
        ) : <Tooltip open={actionDetails} onOpenChange={setActionDetails}><TooltipTrigger render={<Button variant="outline" size="sm"
          aria-label={prepare.pending ? 'Preparando…' : accepted ? `Preparación en cola de ${entry.name}` : note ? `Reintentar preparación de ${entry.name}` : 'Preparar para Unreal'}
          aria-describedby={actionDetails ? actionHintId : undefined}
          disabled={prepare.pending} aria-disabled={accepted || undefined} aria-busy={prepare.pending}
          onClick={() => { if (!accepted) void prepare.fire() }} />}>
          {note && <StatusIcon value="bloqueada" label="No se pudo preparar" tone="error" />}{actionLabel}
        </TooltipTrigger><TooltipContent role="tooltip" id={actionHintId}>{actionHint}</TooltipContent></Tooltip>}
      </div>
    </li>
  )
}

export function Catalogo() {
  const navigate = useNavigate()
  const { data, loading, error } = useResource<CatalogEntry[]>('/catalog', /^catalog\./)
  const index = useIndexCatalog()
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
  const indexButton = <Button variant="outline" size="sm" disabled={index.pending} aria-busy={index.pending} onClick={() => void index.fire()}>{index.pending ? 'Indexando…' : 'Indexar ahora'}</Button>
  if (!data?.length) return <div className="flex flex-col items-end gap-4">{indexButton}<div className="w-full"><EmptyState view="catalogo" message="Aún no se ha indexado nada" action={{ label: 'Pedir un asset', onClick: () => void withViewTransition(() => navigate('/?nueva=1', { flushSync: true })) }} /></div></div>

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
        {indexButton}
      </div>
      {shown.length === 0
        ? <div className="rounded-lg border border-subtle"><EmptyState view="catalogo" message="Ningún asset coincide con tu búsqueda" action={{ label: 'Quitar filtros', onClick: clear }} /></div>
        : <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">{shown.map((e) => <CatalogCard key={e.id} entry={e} />)}</ul>}
    </div>
  )
}
