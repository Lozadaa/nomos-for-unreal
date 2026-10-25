import { ApiError, markUnauthorized, token } from '@/api'
import type { Artifact } from '@/lib/tasks'

/** Hito 22: «Por aprobar», lo que el usuario aprueba viéndolo y jugándolo. */
export interface ApprovalComment { approvalId: string | null; taskId: string | null; text: string; imageId?: string; kind: 'comment' | 'changes'; at: string }
export interface ApprovalItem {
  id: string; taskId: string; state: 'pending' | 'approved' | 'changes'; focus: string[]; createdAt: string
  title: string; area: string; summary: string; evidence: Artifact[]; comments: ApprovalComment[]
}
export interface Approvals { pending: number; items: ApprovalItem[]; general: ApprovalComment[] }

export const stateText: Record<ApprovalItem['state'], string> = {
  pending: 'Esperando tu aprobación', approved: 'Aprobada · sigue a integración', changes: 'Cambios pedidos · vuelve al responsable',
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
