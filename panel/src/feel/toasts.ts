import { toast } from 'sonner'

export interface ToastSpec {
  title: string
  description?: string
  action?: { label: 'View' | 'Undo' | 'Retry' | 'Reload decision'; onClick: () => void }
}

// Un toast por acción, 4 s; el Toaster los apila abajo a la derecha (ver App).
const show = (fn: typeof toast.success) => (spec: ToastSpec) =>
  void fn(spec.title, {
    description: spec.description,
    duration: 4000,
    action: spec.action && { label: spec.action.label, onClick: spec.action.onClick },
  })

export const toasts = { success: show(toast.success), error: show(toast.error), info: show(toast.info) }
