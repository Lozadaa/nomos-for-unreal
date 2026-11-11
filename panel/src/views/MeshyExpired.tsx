import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAction } from '@/feel/useAction'
import { sendCommand } from '@/hooks/assetCommands'
import type { Artifact } from '@/lib/tasks'

/** Modelo de Meshy sin copia propia: el enlace firmado caducó (3 días) antes de descargarlo. */
export const meshyExpired = (a: Artifact) => a.kind === 'model' && a.provenance?.provider === 'meshy' && a.previewPath === null

/** «Regenerar» crea un job nuevo con los mismos parámetros y clave nueva: vuelve a pasar por el presupuesto. */
export function MeshyExpired({ a }: { a: Artifact }) {
  const [sent, setSent] = useState(false)
  const p = a.provenance ?? {}
  const regenerate = useAction(() => sendCommand('asset.meshy_generate', {
    taskId: p.taskId ?? a.taskId, kind: p.kind, params: p.params ?? {}, estimatedCredits: Number(p.estimatedCredits ?? 0),
  }, `meshy:${a.id}:${crypto.randomUUID()}`), {
    success: () => { setSent(true); return { title: 'Regenerating with Meshy', description: 'It goes through the budget before the job is created.' } },
  })
  return <div className="grid size-full place-items-center p-4 text-center">
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm text-warning">Link expired, no local copy</p>
      <Button variant="outline" size="sm" disabled={regenerate.pending || sent} aria-busy={regenerate.pending}
        onClick={() => void regenerate.fire()}>{sent ? 'Queued' : 'Regenerate'}</Button>
    </div>
  </div>
}
