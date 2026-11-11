import { useState } from 'react'
import { XIcon } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { useAuthedSrc } from '@/hooks/artifact'
import { humanError } from '@/lib/errors'
import { imagePath, uploadImage, type ApprovalComment } from '@/lib/approvals'

/** Miniatura de una imagen de comentario; nunca su nombre. */
export function NoteImage({ imageId, alt }: { imageId: string; alt: string }) {
  const src = useAuthedSrc(imagePath(imageId))
  return src ? <img src={src} alt={alt} width={160} height={90} className="h-24 w-auto rounded-md border border-subtle object-contain" /> : null
}

export function Comments({ list }: { list: ApprovalComment[] }) {
  if (!list.length) return null
  return (
    <ul aria-label="Comments" className="flex flex-col gap-2">
      {list.map((c, i) => (
        <li key={`${c.at}-${i}`} className="flex flex-col gap-1 rounded-md bg-card px-3 py-2 text-sm">
          <span className="text-xs text-muted-foreground">{c.kind === 'changes' ? 'Changes requested' : 'Comment'}</span>
          <p className="whitespace-pre-wrap">{c.text}</p>
          {c.imageId && <NoteImage imageId={c.imageId} alt="Comment image" />}
        </li>
      ))}
    </ul>
  )
}

/** Campo de texto en el que se puede pegar una imagen (PNG o JPEG); la sube al pegarla y la enseña debajo. */
export function NoteField({ text, setText, imageId, setImageId, label, placeholder, onSubmit }: {
  text: string; setText: (t: string) => void; imageId: string | null; setImageId: (id: string | null) => void
  label: string; placeholder: string; onSubmit?: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const paste = async (e: React.ClipboardEvent) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'))
    if (!file) return
    e.preventDefault(); setUploading(true); setError(null)
    try { setImageId(await uploadImage(file)) } catch (err) { setError(err) } finally { setUploading(false) }
  }
  return (
    <div className="flex flex-col gap-2">
      <Textarea value={text} aria-label={label} placeholder={placeholder} name={label} autoComplete="off" className="min-h-16"
        onChange={(e) => setText(e.target.value)} onPaste={(e) => void paste(e)}
        onKeyDown={(e) => { if (onSubmit && e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) { e.preventDefault(); onSubmit() } }} />
      {uploading && <span role="status" className="text-xs text-muted-foreground">Uploading image…</span>}
      {!!error && <span role="alert" className="text-xs text-error">Couldn't paste the image. {humanError(error as Error)}</span>}
      {imageId && (
        <span className="flex items-start gap-2">
          <NoteImage imageId={imageId} alt="Pasted image" />
          <button type="button" aria-label="Remove image" className="rounded-sm p-1 text-muted-foreground hover:text-foreground" onClick={() => setImageId(null)}>
            <XIcon className="size-4" />
          </button>
        </span>
      )}
    </div>
  )
}
