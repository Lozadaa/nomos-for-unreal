import { useRef, useState } from 'react'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { ViewerButton } from '@/components/AssetViewer'
import { StatusDot } from '@/components/StatusDot'
import { useAction } from '@/feel/useAction'
import { useAuthedSrc } from '@/hooks/artifact'
import { humanError } from '@/lib/errors'
import { Markdown } from '@/lib/markdown'
import { viewerName } from '@/lib/deliveries'
import { assetName, baselineText, choiceText, stateText, type ApprovalComment, type ApprovalItem, type ConflictSide } from '@/lib/approvals'
import type { Artifact } from '@/lib/tasks'
import { Comments, NoteField } from './ApprovalNote'

const file = (a: Artifact) => `/artifacts/${encodeURIComponent(a.id)}/file`
const label = 'text-xs font-medium tracking-wider text-muted-foreground uppercase'

/** Vídeo con controles y sin reproducción automática (nunca suena solo); el fotograma del 50 % como portada. */
function Video({ a }: { a: Artifact }) {
  const src = useAuthedSrc(file(a)), poster = useAuthedSrc(a.previewPath ? `/artifacts/${encodeURIComponent(a.id)}/preview` : null)
  return src ? <video controls preload="metadata" playsInline src={src} poster={poster ?? undefined} aria-label={viewerName(a)}
    className="aspect-video w-full max-w-[1280px] rounded-md border border-subtle bg-black object-contain" />
    : <div className="aspect-video w-full max-w-[1280px] rounded-md bg-card" />
}
function Thumb({ a, onOpen, wide = false }: { a: Artifact; onOpen: (el: HTMLElement) => void; wide?: boolean }) {
  const src = useAuthedSrc(file(a)), name = viewerName(a)
  return <li className={wide ? 'aspect-video w-full overflow-hidden rounded-lg border border-subtle bg-card ' : 'aspect-video w-60 shrink-0 overflow-hidden rounded-md border border-subtle bg-card'}>
    <ViewerButton name={name} onOpen={onOpen}>{src && <img src={src} alt={name} width={320} height={180} loading="lazy" className="size-full object-cover" />}</ViewerButton>
  </li>
}

/** Una de las dos versiones de un conflicto: quién, en qué frente, qué tarea y cuándo. */
function Side({ title, side }: { title: string; side: ConflictSide }) {
  return <div className="flex flex-col gap-1 rounded-md border border-subtle p-3 text-sm">
    <h4 className={label}>{title}</h4>
    <p className="font-medium">{side.who}{side.frente && <span className="text-muted-foreground"> · {side.frente}</span>}</p>
    <p>{side.task}</p>
    <p className="text-xs text-muted-foreground">{new Date(side.at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</p>
  </div>
}

/** Hito 28: una imagen de la línea base (propuesta, actual o diferencia) con su rótulo. */
function Shot({ src, title }: { src: string; title: string }) {
  const url = useAuthedSrc(src)
  return <figure className="flex flex-col gap-1"><figcaption className={label}>{title}</figcaption>
    <div className="aspect-video w-full overflow-hidden rounded-md border border-subtle bg-card">{url && <img src={url} alt={title} className="size-full object-contain" />}</div>
  </figure>
}

type Mode = 'idle' | 'changes'
/** Un elemento de «Por aprobar»: qué es, lo visual primero, en qué fijarse y las tres acciones con respuesta en el acto. */
export function ApprovalCard({ item, open, patch, compact = false }: {
  item: ApprovalItem; open: (id: string, el: HTMLElement) => void; patch: (change: Partial<ApprovalItem>) => () => void
  /** Inicio: la imagen grande y los botones grandes; comentar queda en «Por aprobar». */
  compact?: boolean
}) {
  const [mode, setMode] = useState<Mode>('idle')
  const [text, setText] = useState('')
  const [imageId, setImageId] = useState<string | null>(null)
  const sent = useRef<{ text: string; imageId: string | null }>({ text: '', imageId: null })
  const base = `/approvals/${encodeURIComponent(item.id)}`
  const take = () => { sent.current = { text, imageId }; setText(''); setImageId(null) }
  const restore = () => { setText(sent.current.text); setImageId(sent.current.imageId) }
  const note = (kind: ApprovalComment['kind']): ApprovalComment => ({ approvalId: item.id, taskId: item.taskId, text: sent.current.text, kind,
    at: new Date().toISOString(), ...(sent.current.imageId ? { imageId: sent.current.imageId } : {}) })
  const body = () => ({ text: sent.current.text, ...(sent.current.imageId ? { imageId: sent.current.imageId } : {}) })

  const approve = useAction(() => api(`${base}/approve`, { method: 'POST', body: {} }), { optimistic: () => patch({ state: 'approved' }) })
  const changes = useAction(() => api(`${base}/changes`, { method: 'POST', body: body() }), {
    optimistic: () => { take(); const undo = patch({ state: 'changes', comments: [...item.comments, note('changes')] }); setMode('idle'); return () => { undo(); restore(); setMode('changes') } },
  })
  const comment = useAction(() => api(`${base}/comment`, { method: 'POST', body: body() }), {
    optimistic: () => { take(); const undo = patch({ comments: [...item.comments, note('comment')] }); return () => { undo(); restore() } },
  })
  // hito 29: conflicto en un binario con otra persona; quien chocó elige versión y Nomos la aplica en Git
  const keepAs = (side: 'mine' | 'theirs') => [() => api(`${base}/keep`, { method: 'POST', body: { side } }),
    { optimistic: () => patch({ state: 'approved', choice: side }) }] as const
  const reject = useAction(() => api(`${base}/reject`, { method: 'POST', body: {} }), { optimistic: () => patch({ state: 'changes' }) })
  const mine = useAction(...keepAs('mine')), theirs = useAction(...keepAs('theirs')), keeping = mine.pending || theirs.pending
  const failed = approve.error ?? reject.error ?? changes.error ?? comment.error ?? mine.error ?? theirs.error
  const videos = item.evidence.filter((a) => a.kind === 'video'), images = item.evidence.filter((a) => a.kind !== 'video')
  const pending = item.state === 'pending', conflict = item.conflict, shots = item.baseline
  const size = compact ? 'lg' : 'sm', big = compact ? 'h-11 min-w-32 px-6 text-base' : undefined
  const status = conflict ? (pending ? 'Conflicto: elige con qué versión te quedas' : choiceText[item.choice ?? 'manual']) : shots ? baselineText[item.state] : stateText[item.state]

  return (
    <article aria-label={item.title} data-approval className="flex flex-col gap-4 rounded-lg border border-subtle p-6">
      <header className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">{item.title}</h3>
        {item.summary && <Markdown clamp className="text-sm text-muted-foreground" text={item.summary} />}
        <span role="status" className="flex items-center gap-2 text-xs"><StatusDot tone={pending ? 'warning' : item.state === 'approved' ? 'success' : 'neutral'} />{status}</span>
        {pending && item.blocked && <p className="text-sm font-medium text-warning">{item.blocked}</p>}
        {conflict && <p className="text-sm font-medium text-warning">Conflicto en {conflict.files.map(assetName).join(', ')} con {conflict.theirs.who}</p>}
      </header>
      {conflict && <section aria-label="Las dos versiones" className="grid gap-3 sm:grid-cols-2">
        <Side title="La tuya" side={conflict.mine} />
        <Side title="La suya" side={conflict.theirs} />
      </section>}
      {shots && <section aria-label="Línea base" className="grid gap-3 sm:grid-cols-3">
        <Shot src={`${base}/baseline/propuesta`} title={pending ? 'Propuesta' : 'Línea base'} />
        {pending && shots.current && <Shot src={`${base}/baseline/actual`} title="Actual" />}
        {shots.diff && <Shot src={`${base}/baseline/diferencia`} title="Diferencia" />}
      </section>}
      {/* para juzgar un golpe hay que verlo grande: cada vídeo a todo el ancho útil (máx. 1280 px); las imágenes, debajo en tira */}
      {videos.length > 0 && <div className="flex flex-col gap-3">{videos.map((a) => <Video key={a.id} a={a} />)}</div>}
      {images.length > 0 && <ul aria-label="Imágenes" className={compact ? 'grid gap-3 sm:grid-cols-2' : 'flex gap-3 overflow-x-auto pb-1'}>
        {images.map((a) => <Thumb key={a.id} a={a} wide={compact} onOpen={(el) => open(a.id, el)} />)}
      </ul>}
      {!item.evidence.length && !shots && <p className="text-sm text-muted-foreground">Aún no hay vídeo ni imágenes de este elemento.</p>}
      {item.focus.length > 0 && <section className="flex flex-col gap-2"><h4 className={label}>En qué fijarte</h4>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">{item.focus.map((f) => <li key={f}>{f}</li>)}</ul></section>}
      {!compact && <Comments list={item.comments} />}
      {(!compact || mode === 'changes') && <NoteField text={text} setText={setText} imageId={imageId} setImageId={setImageId}
        label={mode === 'changes' ? `Qué cambiar en ${item.title}` : `Comentario sobre ${item.title}`}
        placeholder={mode === 'changes' ? 'Qué debería cambiar (obligatorio)…' : 'Tu opinión; puedes pegar una imagen…'}
        onSubmit={() => void (mode === 'changes' ? changes.fire() : comment.fire())} />}
      <div className="flex flex-wrap items-center gap-2">
        {pending && conflict && <>
          <Button size="sm" disabled={keeping} onClick={() => void mine.fire()}>Quedarme con la mía</Button>
          <Button size="sm" variant="outline" disabled={keeping} onClick={() => void theirs.fire()}>Quedarme con la suya</Button>
        </>}
        {pending && !conflict && mode === 'idle' && <Button size={size} className={big} disabled={approve.pending} aria-busy={approve.pending} onClick={() => void approve.fire()}>Aprobar</Button>}
        {pending && !conflict && !shots && mode === 'idle' && <Button size={size} className={big} variant="outline" onClick={() => setMode('changes')}>Pedir cambios</Button>}
        {pending && shots && mode === 'idle' && <Button size={size} className={big} variant="outline" disabled={reject.pending} onClick={() => void reject.fire()}>Rechazar</Button>}
        {pending && mode === 'changes' && <>
          <Button size="sm" disabled={!text.trim() || changes.pending} onClick={() => void changes.fire()}>Enviar los cambios</Button>
          <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>Cancelar</Button>
        </>}
        {mode === 'idle' && !compact && <Button size="sm" variant="ghost" disabled={!text.trim() || comment.pending} onClick={() => void comment.fire()}>Comentar</Button>}
        {failed && <span role="alert" className="text-xs text-error">No se registró. {humanError(failed)}</span>}
      </div>
    </article>
  )
}
