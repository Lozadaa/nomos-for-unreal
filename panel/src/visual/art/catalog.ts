import { Activity, ClipboardList, Library, MessageCircle, PackageCheck, Plug, Scale, Wallet, type LucideIcon } from 'lucide-react'

export type ArtView = 'produccion' | 'actividad' | 'entregas' | 'catalogo' | 'chat' | 'decisiones' | 'presupuesto' | 'capacidades'
export type EmptyAction = { label: string; href: string } | { label: string; onClick: () => void }
type EmptySpec = { label: string; Icon: LucideIcon; message: string; action: EmptyAction }

/** Un concepto reconocible, una frase y una salida concreta por vista. */
export const catalog: Record<ArtView, EmptySpec> = {
  produccion: { label: 'Producción', Icon: ClipboardList, message: 'Todavía no hay tareas.', action: { label: 'Nueva petición', href: '/?nueva=1' } },
  actividad: { label: 'Actividad', Icon: Activity, message: 'Todavía no hay actividad.', action: { label: 'Nueva petición', href: '/?nueva=1' } },
  entregas: { label: 'Entregas', Icon: PackageCheck, message: 'Todavía no hay entregas.', action: { label: 'Nueva petición', href: '/?nueva=1' } },
  catalogo: { label: 'Catálogo', Icon: Library, message: 'Todavía no hay assets indexados.', action: { label: 'Pedir un asset', href: '/?nueva=1' } },
  chat: { label: 'Chat', Icon: MessageCircle, message: 'Todavía no hay mensajes.', action: { label: 'Nueva petición', href: '/?nueva=1' } },
  decisiones: { label: 'Decisiones', Icon: Scale, message: 'No tienes decisiones pendientes.', action: { label: 'Ver producción', href: '/' } },
  presupuesto: { label: 'Presupuesto', Icon: Wallet, message: 'No hay límites de gasto definidos.', action: { label: 'Pedir un límite', href: '/chat' } },
  capacidades: { label: 'Capacidades', Icon: Plug, message: 'No hay capacidades disponibles.', action: { label: 'Abrir chat', href: '/chat' } },
}
