import { ApiError, markUnauthorized, token } from '@/api'
import type { Artifact } from '@/lib/tasks'

/** Hito 22: «Por aprobar», lo que el usuario aprueba viéndolo y jugándolo. */
export interface ApprovalComment { approvalId: string | null; taskId: string | null; text: string; imageId?: string; kind: 'comment' | 'changes'; at: string }
export interface ApprovalItem {
  id: string; taskId: string; state: 'pending' | 'approved' | 'changes'; focus: string[]; createdAt: string
  title: string; area: string; summary: string; evidence: Artifact[]; comments: ApprovalComment[]
  /** Hito 25: el cierre de hito no cierra sin tu «Aprobar» sobre la build jugable. */
  blocked?: string | null
  /** Hito 29: conflicto en un mapa o asset con otra persona del equipo; `choice` = la versión que se quedó. */
  conflict?: Conflict | null; choice?: 'mine' | 'theirs' | 'manual' | null
  /** Hito 28: línea base visual propuesta; `current`/`diff` existen si ya había una. Sus imágenes, en `/approvals/:id/baseline/…`. */
  baseline?: { name: string; current: string | null; diff: string | null } | null
  type?: 'task' | 'conflict' | 'baseline'
}
export interface ConflictSide { who: string; frente: string; task: string; at: string }
export interface Conflict { files: string[]; mine: ConflictSide; theirs: ConflictSide }
/** «L_Arena» de `Content/Mapas/L_Arena.umap`. */
export const assetName = (path: string) => path.split('/').pop()!.replace(/\.(umap|uasset)$/i, '')
export const choiceText = { mine: 'Kept yours · merge continues', theirs: 'Kept theirs · your task is redone on top of it',
  manual: 'Resolved by hand · merge continues' } as const
export const baselineText: Record<ApprovalItem['state'], string> = {
  pending: 'Proposed baseline · reports without failing until approved', approved: 'Approved · now the baseline', changes: 'Rejected · the next capture proposes another',
}
export interface Approvals { pending: number; items: ApprovalItem[]; general: ApprovalComment[] }

export const stateText: Record<ApprovalItem['state'], string> = {
  pending: 'Waiting for your approval', approved: 'Approved · on to merge', changes: 'Changes requested · back to the owner',
}

/** La imagen pegada en un comentario sube aparte (el cuerpo JSON tiene 64 KB) y el comentario lleva su referencia. */
export async function uploadImage(file: Blob): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new ApiError(400, 'invalid_image')
  const response = await fetch('/approvals/images', { method: 'POST', headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': file.type }, body: file })
  if (response.status === 401) markUnauthorized()
  const data = await response.json().catch(() => ({})) as { imageId?: string; error?: string }
  if (!response.ok || !data.imageId) throw new ApiError(response.status, data.error ?? `http_${response.status}`)
  return data.imageId
}
export const imagePath = (imageId: string) => `/approvals/images/${imageId}`
