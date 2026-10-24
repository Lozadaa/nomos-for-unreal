import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ChevronLeft, ChevronRight, XIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { GlbViewer } from '@/components/GlbViewer'
import { useAuthedSrc } from '@/hooks/artifact'
import { isErrorLine } from '@/lib/artifactName'
import { cn } from '@/lib/utils'

/** Un asset del listado tal como se ve (filtrado y ordenado). `path` es del servicio (lleva token); `url`, una dirección ya usable. */
export interface ViewerItem {
  id: string
  name: string
  meta: string[]
  type: 'image' | 'video' | 'model' | 'text' | 'other'
  path?: string | null
  url?: string | null
  /** Artefacto del servicio que `GlbViewer` carga por id. */
  modelId?: string
  /** Lo que se ve cuando no hay vista propia: el glifo del artefacto o el aviso de Meshy caducado. */
  fallback?: ReactNode
  /** Galería de ángulos (hito 10): las imágenes de una misma comprobación comparten `group`; `angle` es su rótulo. */
  group?: string
  angle?: string
}

export const viewerType = (path: string): ViewerItem['type'] =>
  /\.(png|jpe?g|webp)$/i.test(path) ? 'image' : /\.(mp4|webm)$/i.test(path) ? 'video' : /\.(glb|gltf)$/i.test(path) ? 'model' : /\.(log|txt|md|json)$/i.test(path) ? 'text' : 'other'

/** La miniatura de una tarjeta: abre el visor y no hace nada más (en Decisiones no elige la opción). */
export function ViewerButton({ name, onOpen, children, className }: {
  name: string; onOpen: (el: HTMLElement) => void; children: ReactNode; className?: string
}) {
  return <button type="button" aria-label={`Ver ${name} a tamaño completo`} className={className ?? 'block size-full cursor-zoom-in outline-offset-2'}
    onClick={(e) => { e.stopPropagation(); onOpen(e.currentTarget) }}>{children}</button>
}

/** Texto completo de un registro o informe, con las líneas de error resaltadas. */
function TextBody({ src }: { src: string }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setText(null)
    fetch(src).then((r) => r.ok ? r.text() : 'No se pudo leer el archivo.').then((t) => { if (alive) setText(t) }, () => { if (alive) setText('No se pudo leer el archivo.') })
    return () => { alive = false }
  }, [src])
  if (text === null) return <p role="status" className="text-sm text-muted-foreground">Cargando…</p>
  return <pre aria-label="Contenido completo" className="size-full overflow-auto rounded-md bg-card p-3 font-mono text-xs leading-5">
    {text.split(/\r?\n/).map((line, i) => <span key={i} className={isErrorLine(line) ? 'block text-error' : 'block'}>{line || ' '}</span>)}
  </pre>
}

function Body({ item, src }: { item: ViewerItem; src: string | null }) {
  if (item.type === 'model' && item.modelId) return <div className="size-full"><GlbViewer id={item.modelId} name={item.name} /></div>
  // resolución natural sin recorte: el cuadro (relative) da el alto y el ancho máximos; una imagen pequeña no se amplía
  if (item.type === 'image' && src) return <img src={src} alt={item.name} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" />
  // hito 5b: el clip de una animación se ve en bucle, sin sonido, con controles; mismo cuadro que una imagen
  if (item.type === 'video' && src) return <video src={src} aria-label={item.name} controls autoPlay muted loop playsInline
    className="absolute inset-0 m-auto max-h-full max-w-full" />
  if (item.type === 'text' && src) return <TextBody src={src} />
  return <div className="flex flex-col items-center gap-4 text-muted-foreground">{item.fallback}</div>
}

/** Miniatura de un ángulo en la tira inferior del visor. */
function AngleThumb({ item, active, onSelect }: { item: ViewerItem; active: boolean; onSelect: () => void }) {
  const src = useAuthedSrc(item.path ?? null)
  return <button type="button" aria-label={item.angle} aria-current={active ? 'true' : undefined} onClick={onSelect} title={item.angle}
    className={cn('flex w-28 shrink-0 flex-col gap-1 rounded-md border p-1 text-xs outline-offset-2', active ? 'border-strong text-foreground' : 'border-subtle text-muted-foreground hover:border-strong')}>
    {src && <img src={src} alt="" width={112} height={63} className="aspect-video w-full rounded-sm object-cover" />}
    <span className="truncate">{item.angle}</span>
  </button>
}

function AssetDialog({ items, id, setId, opener }: {
  items: ViewerItem[]; id: string | null; setId: (id: string | null) => void; opener: RefObject<HTMLElement | null>
}) {
  const index = id ? items.findIndex((i) => i.id === id) : -1
  const item = index >= 0 ? items[index] : null
  const served = useAuthedSrc(item?.path ?? null)
  const src = item?.url ?? served
  const angles = item?.group ? items.filter((i) => i.group === item.group) : []
  const go = (step: number) => { if (items.length > 1 && index >= 0) setId(items[(index + step + items.length) % items.length].id) }
  return <Dialog open={!!item} onOpenChange={(open) => { if (!open) setId(null) }}>
    {item && <DialogContent finalFocus={opener} showCloseButton={false}
      className="flex h-[85vh] w-[90vw] max-w-[90vw] flex-col gap-3 p-4 sm:max-w-[90vw]"
      onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); go(1) } if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) } }}>
      <div className="flex min-w-0 flex-col gap-1 pr-10">
        <DialogTitle className="truncate text-base font-medium">{item.name}</DialogTitle>
        {item.meta.length > 0 && <DialogDescription className="truncate text-xs text-muted-foreground">{item.meta.join(' · ')}</DialogDescription>}
      </div>
      <div data-viewer-frame className="relative grid min-h-0 flex-1 place-items-center overflow-hidden">
        <Body item={item} src={src} />
      </div>
      {angles.length > 1 && <div role="group" aria-label="Ángulos" className="flex justify-center gap-2 overflow-x-auto">
        {angles.map((a) => <AngleThumb key={a.id} item={a} active={a.id === item.id} onSelect={() => setId(a.id)} />)}
      </div>}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" aria-label="Anterior" disabled={items.length < 2} onClick={() => go(-1)}><ChevronLeft />Anterior</Button>
        <Button variant="outline" size="sm" aria-label="Siguiente" disabled={items.length < 2} onClick={() => go(1)}>Siguiente<ChevronRight /></Button>
        <span className="text-xs text-muted-foreground tabular-nums">{index + 1} de {items.length}</span>
        {src && <a href={src} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'ml-auto' })}>Abrir original</a>}
        <DialogClose render={<Button variant="outline" size="sm" className={src ? undefined : 'ml-auto'} />}><XIcon />Cerrar</DialogClose>
      </div>
    </DialogContent>}
  </Dialog>
}

/** Visor de assets a detalle: un solo diálogo por listado; la miniatura que lo abrió recupera el foco al cerrar. */
export function useAssetViewer(items: ViewerItem[]) {
  const [id, setId] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  return {
    open: (itemId: string, el: HTMLElement) => { opener.current = el; setId(itemId) },
    viewer: <AssetDialog items={items} id={id} setId={setId} opener={opener} />,
  }
}
