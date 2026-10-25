import { useRef, useState } from 'react'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAssetViewer, viewerType, type ViewerItem } from '@/components/AssetViewer'
import { useAction } from '@/feel/useAction'
import { useAfter } from '@/hooks/time'
import { useResource } from '@/hooks/useResource'
import { humanError } from '@/lib/errors'
import { viewerName } from '@/lib/deliveries'
import type { ApprovalComment, ApprovalItem, Approvals } from '@/lib/approvals'
import { ApprovalCard } from './ApprovalCard'
import { Comments, NoteField } from './ApprovalNote'

const viewerItems = (items: ApprovalItem[]): ViewerItem[] => items.flatMap((i) => i.evidence.filter((a) => a.kind !== 'video')
  .map((a) => ({ id: a.id, name: viewerName(a), meta: [i.title], type: viewerType(a.path), path: `/artifacts/${encodeURIComponent(a.id)}/file` })))

/** El comentario general: no es de ningún elemento y llega al director como mensaje. */
function General({ list, add }: { list: ApprovalComment[]; add: (c: ApprovalComment) => () => void }) {
  const [text, setText] = useState(''), [imageId, setImageId] = useState<string | null>(null)
  const sent = useRef<{ text: string; imageId: string | null }>({ text: '', imageId: null })
  const send = useAction(() => api('/approvals/comment', { method: 'POST', body: { text: sent.current.text, ...(sent.current.imageId ? { imageId: sent.current.imageId } : {}) } }), {
    optimistic: () => {
      sent.current = { text, imageId }; setText(''); setImageId(null)
      const undo = add({ approvalId: null, taskId: null, text, kind: 'comment', at: new Date().toISOString(), ...(imageId ? { imageId } : {}) })
      return () => { undo(); setText(sent.current.text); setImageId(sent.current.imageId) }
    },
  })
  return (
    <section aria-label="Comentario general" className="flex flex-col gap-3 rounded-lg border border-subtle p-6">
      <h3 className="text-sm font-medium">Comentario general</h3>
      <Comments list={list} />
      <NoteField text={text} setText={setText} imageId={imageId} setImageId={setImageId} label="Comentario general"
        placeholder="Algo sobre el conjunto; puedes pegar una imagen…" onSubmit={() => void send.fire()} />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={!text.trim() || send.pending} onClick={() => void send.fire()}>Comentar</Button>
        {send.error && <span role="alert" className="text-xs text-error">No se envió. {humanError(send.error)}</span>}
      </div>
    </section>
  )
}

export function PorAprobar() {
  const { data, loading, error, mutate } = useResource<Approvals>('/approvals', /^approval\.|^artifact\./)
  const slow = useAfter(loading)
  const items = data?.items ?? []
  const { open, viewer } = useAssetViewer(viewerItems(items))
  const patch = (id: string) => (change: Partial<ApprovalItem>) => mutate((all) => {
    const items = all.items.map((i) => (i.id === id ? { ...i, ...change } : i))
    return { ...all, items, pending: items.filter((i) => i.state === 'pending').length }
  })
  const addGeneral = (c: ApprovalComment) => mutate((all) => ({ ...all, general: [...all.general, c] }))

  if (error && !data) return <p role="alert" className="text-sm text-error">No se pudo cargar «Por aprobar». {humanError(new Error(error))}</p>
  if (loading) return slow ? <div role="status" aria-label="Cargando lo que está por aprobar" className="flex flex-col gap-3">{Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-64" />)}</div> : null
  const pending = items.filter((i) => i.state === 'pending').length
  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <h2 role="status" className="text-sm text-muted-foreground">
        {pending === 0 ? 'Nada por aprobar ahora' : pending === 1 ? 'Tienes 1 elemento por aprobar' : `Tienes ${pending} elementos por aprobar`}
      </h2>
      {items.map((item) => <ApprovalCard key={item.id} item={item} open={open} patch={patch(item.id)} />)}
      <General list={data?.general ?? []} add={addGeneral} />
      {viewer}
    </div>
  )
}
